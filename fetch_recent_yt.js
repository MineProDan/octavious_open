require('dotenv').config();
module.exports = { fetchRecentVideos };
const API_KEY = process.env.YOUTUBE_API_KEY;


// Comma-separated YouTube channel IDs to watch for new uploads.
const CHANNEL_IDS = (process.env.YOUTUBE_CHANNEL_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

const BASE_URL = "https://www.googleapis.com/youtube/v3";

/**
 * Make a request to the YouTube API
 */
async function youtubeRequest(endpoint, params) {
    const url = new URL(`${BASE_URL}/${endpoint}`);

    Object.entries({
        ...params,
        key: API_KEY
    }).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });

    const response = await fetch(url);

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`YouTube API error ${response.status}: ${error}`);
    }

    return response.json();
}

/**
 * Get the uploads playlist ID for a channel
 */
async function getUploadsPlaylist(channelId) {
    const data = await youtubeRequest("channels", {
        part: "contentDetails,snippet",
        id: channelId
    });

    if (!data.items || data.items.length === 0) {
        throw new Error(`Channel not found: ${channelId}`);
    }

    return {
        channelId,
        channelName: data.items[0].snippet.title,
        uploadsPlaylist:
            data.items[0].contentDetails.relatedPlaylists.uploads
    };
}

/**
 * Get the newest video from an uploads playlist
 */
async function getLatestVideo(channel) {
    const data = await youtubeRequest("playlistItems", {
        part: "snippet,contentDetails",
        playlistId: channel.uploadsPlaylist,
        maxResults: 1
    });

    if (!data.items || data.items.length === 0) {
        return null;
    }

    const video = data.items[0];
    const statistics = await youtubeRequest("videos", {
        part: "statistics",
        id: video.contentDetails.videoId,
    });
    const viewCount = statistics.items?.[0]?.statistics?.viewCount;

    return {
        channelId: channel.channelId,
        channelName: channel.channelName,
        videoId: video.contentDetails.videoId,
        title: video.snippet.title,
        thumbnail: video.snippet.thumbnails?.maxres?.url ||
                   video.snippet.thumbnails?.standard?.url ||
                   video.snippet.thumbnails?.high?.url ||
                   video.snippet.thumbnails?.medium?.url ||
                   video.snippet.thumbnails?.default?.url,
        viewCount,
        publishedAt: video.contentDetails.videoPublishedAt ||
                     video.snippet.publishedAt,
        url: `https://www.youtube.com/watch?v=${video.contentDetails.videoId}`
    };
}

/**
 * Main
 */
async function main(mongoClient, mongoDB) {

    // The YouTube feed is optional: without a key or channels there is nothing to fetch.
    if (!API_KEY || CHANNEL_IDS.length === 0) return;

    //console.log(`Checking ${CHANNEL_IDS.length} channels...\n`);

    // Get uploads playlists for all channels
    const channels = await Promise.all(
        CHANNEL_IDS.map(async (channelId) => {
            try {
                return await getUploadsPlaylist(channelId);
            } catch (error) {
                console.error(
                    `Failed to get channel ${channelId}:`,
                    error.message
                );
                return null;
            }
        })
    );

    const validChannels = channels.filter(Boolean);

    // Get newest video from every channel
    const latestVideos = await Promise.all(
        validChannels.map(async (channel) => {
            try {
                return await getLatestVideo(channel);
            } catch (error) {
                console.error(
                    `Failed to get latest video from ${channel.channelName}:`,
                    error.message
                );
                return null;
            }
        })
    );

    const videos = latestVideos.filter(Boolean);

    if (videos.length === 0) {
        //console.log("No videos found.");
        return;
    }

    // Sort newest -> oldest
    videos.sort(
        (a, b) =>
            new Date(b.publishedAt) - new Date(a.publishedAt)
    );

    // The first video is the newest across all channels
    const newest = videos[0];
    await mongoDB.collection("live_data").updateOne(
        { _id: 'latest_video' },
        { $set: {
            latestVidURL: newest.url,
            latestVidTitle: newest.title,
            latestVidChannel: newest.channelName,
            latestVidDate: newest.publishedAt,
            latestVidThumbnail: newest.thumbnail,
            latestVidViews: newest.viewCount,
        } },
        { upsert: true }
    );

    // console.log("========================================");
    // console.log("        NEWEST VIDEO OVERALL");
    // console.log("========================================");
    // console.log(`Channel:   ${newest.channelName}`);
    // console.log(`Title:     ${newest.title}`);
    // console.log(`Published: ${newest.publishedAt}`);
    // console.log(`URL:       ${newest.url}`);
    // console.log(`Video ID:  ${newest.videoId}`);
    // console.log("========================================\n");

    // console.log("Latest video from each channel:");
    // console.log("----------------------------------------");

    // for (const video of videos) {
    //     console.log(
    //         `${video.channelName}\n` +
    //         `  ${video.title}\n` +
    //         `  ${video.publishedAt}\n` +
    //         `  ${video.url}\n`
    //     );
    // }
}
async function fetchRecentVideos(mongoClient, mongoDB) {
    try {
        await main(mongoClient, mongoDB);
    } catch (error) {
        console.error("Error fetching recent videos:", error);
    }
}
