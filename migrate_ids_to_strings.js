/**
 * One-time migration: convert numeric _id / user_id fields to strings.
 *
 * Why: Discord snowflake IDs are 17-19 digit integers. The bot (Python) stores
 * them as exact big integers, which Mongo/BSON handles fine. The old dashboard
 * code converted them with JS `parseInt`, which silently rounds any ID over
 * ~16 digits to the nearest representable double. That's a different number
 * than the bot's exact integer, which is why some users' data synced and
 * others' didn't.
 *
 * The fix standardizes on storing these IDs as STRINGS everywhere (bot and
 * website), since strings never lose precision. This script rewrites your
 * existing documents to match.
 *
 * Run this ONCE, after deploying the updated bot cogs and server.js, and
 * BEFORE (or right after) you start the updated bot/website so nothing writes
 * a fresh integer-keyed document in between.
 *
 * Usage:
 *   node migrate_ids_to_strings.js
 *
 * Requires MONGO_URI in your environment / .env (same one your server.js uses).
 */

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error('❌ MONGO_URI not found in environment / .env');
    process.exit(1);
}

// Collections where the whole document is keyed by user id via `_id`
const ID_KEYED_COLLECTIONS = [
    'custom_workouts_v2',
    'user_flexes',
    'user_stats',
];

// Collections where the user id lives in a `user_id` field instead of `_id`
const USER_ID_FIELD_COLLECTIONS = [
    { name: 'workout_reminders', field: 'user_id' },
];

async function migrateIdKeyedCollection(db, collectionName) {
    const coll = db.collection(collectionName);
    const cursor = coll.find({ _id: { $type: 'long' } }); // matches int64 _id
    // Also catch plain 'int' (32-bit) just in case, and 'double' from any old parseInt-derived docs
    const cursorAlt = coll.find({ _id: { $type: ['int', 'double'] } });

    let migrated = 0;
    let skippedDuplicate = 0;

    for await (const doc of cursor) {
        migrated += await migrateOneDoc(coll, doc);
    }
    for await (const doc of cursorAlt) {
        migrated += await migrateOneDoc(coll, doc);
    }

    console.log(`  ${collectionName}: migrated ${migrated} document(s)`);
}

async function migrateOneDoc(coll, doc) {
    const stringId = String(doc._id);
    const existing = await coll.findOne({ _id: stringId });

    if (existing) {
        console.warn(`    ⚠️  Skipping ${doc._id} -> "${stringId}": a string-keyed document already exists. Merge manually if needed.`);
        return 0;
    }

    const { _id, ...rest } = doc;
    await coll.insertOne({ _id: stringId, ...rest });
    await coll.deleteOne({ _id: doc._id });
    return 1;
}

async function migrateUserIdFieldCollection(db, collectionName, field) {
    const coll = db.collection(collectionName);
    const cursor = coll.find({ [field]: { $type: ['long', 'int', 'double'] } });

    let migrated = 0;
    for await (const doc of cursor) {
        await coll.updateOne(
            { _id: doc._id },
            { $set: { [field]: String(doc[field]) } }
        );
        migrated++;
    }
    console.log(`  ${collectionName}: migrated ${migrated} document(s)`);
}

async function main() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db('GymBotDB');

    console.log('🔧 Migrating _id-keyed collections...');
    for (const name of ID_KEYED_COLLECTIONS) {
        await migrateIdKeyedCollection(db, name);
    }

    console.log('🔧 Migrating user_id-field collections...');
    for (const { name, field } of USER_ID_FIELD_COLLECTIONS) {
        await migrateUserIdFieldCollection(db, name, field);
    }

    console.log('✅ Migration complete.');
    await client.close();
}

main().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});