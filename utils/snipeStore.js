let mongoDB;

function getMongoDB() {
    if (!mongoDB) {
        ({ mongoDB } = require('../index'));
    }
    return mongoDB;
}

const SNIPE_TYPES = {
    deleted: 'deleted',
    edited: 'edited',
};

function normalizeSnipeType(type) {
    const normalized = String(type || '').trim().toLowerCase();
    return SNIPE_TYPES[normalized] || normalized || 'deleted';
}

function getDocumentSelector(type) {
    return { type: normalizeSnipeType(type) };
}

function getChannelPath(channelId) {
    return `channels.${channelId}`;
}

function buildSnipeChannelUpdate(type, channelId, data) {
    const normalizedType = normalizeSnipeType(type);
    return {
        $set: {
            type: normalizedType,
            [getChannelPath(channelId)]: data,
        },
    };
}

async function saveSnipe(type, channelId, data) {
    const db = getMongoDB();
    const normalizedType = normalizeSnipeType(type);
    await db.collection('live_data').updateOne(
        { type: normalizedType },
        {
            $set: {
                type: normalizedType,
                [getChannelPath(channelId)]: data,
            },
        },
        { upsert: true },
    );
}

async function getSnipe(type, channelId) {
    const db = getMongoDB();
    const document = await db.collection('live_data').findOne(getDocumentSelector(type));
    if (!document) return null;

    const channelPath = getChannelPath(channelId);
    return document?.channels?.[channelId] ?? document?.[channelPath] ?? null;
}

module.exports = {
    SNIPE_TYPES,
    normalizeSnipeType,
    getDocumentSelector,
    getChannelPath,
    buildSnipeChannelUpdate,
    saveSnipe,
    getSnipe,
};