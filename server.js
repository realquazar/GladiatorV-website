const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { MongoClient } = require('mongodb');
const axios = require('axios');
const path = require('path');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'gladiator_super_secret_key',
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'strict'
    }
}));

// MongoDB Client
const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

async function connectDB() {
    try {
        await mongoClient.connect();
        db = mongoClient.db('GymBotDB');
        console.log('✅ Connected to MongoDB (GymBotDB)');
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err);
    }
}
connectDB();

function checkAuth(req, res, next) {
    if (req.session.user) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized. Please login via Discord.' });
}

// Default Gladiator V Routines from workout_cog.py
const DEFAULT_ROUTINES = {
    "Beginner": {
        "Gym": {
            "Monday": [["Pushups", "3x10"], ["Bicep curls", "3x10"], ["Lateral raises", "3x10"], ["Crunches", "3x10"]],
            "Tuesday": [["Pushups", "3x10"], ["Bicep curls", "3x10"], ["Lateral raises", "3x10"], ["Crunches", "3x10"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Pushups", "3x10"], ["Bicep curls", "3x10"], ["Lateral raises", "3x10"], ["Crunches", "3x10"]],
            "Friday": [["Pushups", "3x10"], ["Bicep curls", "3x10"], ["Lateral raises", "3x10"], ["Crunches", "3x10"]],
            "Saturday": [["Pushups", "3x10"], ["Bicep curls", "3x10"], ["Lateral raises", "3x10"], ["Crunches", "3x10"]],
            "Sunday": "Rest Day"
        },
        "Calisthenics": {
            "Monday": [["Push ups", "3x10"], ["Pull ups", "3x10"], ["Dips", "3x10"], ["Pike push ups", "3x10"]],
            "Tuesday": [["Push ups", "3x10"], ["Pull ups", "3x10"], ["Dips", "3x10"], ["Pike push ups", "3x10"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Push ups", "3x10"], ["Pull ups", "3x10"], ["Dips", "3x10"], ["Pike push ups", "3x10"]],
            "Friday": [["Push ups", "3x10"], ["Pull ups", "3x10"], ["Dips", "3x10"], ["Pike push ups", "3x10"]],
            "Saturday": [["Push ups", "3x10"], ["Pull ups", "3x10"], ["Dips", "3x10"], ["Pike push ups", "3x10"]],
            "Sunday": "Rest Day"
        }
    },
    "Intermediate": {
        "Gym": {
            "Monday": [["Bicep Curls", "3x10"], ["Hammer Curls", "3x10"], ["Tricep Pushdowns", "3x10"], ["Overhead Extensions", "3x10"], ["Barbell Curls", "3x10"]],
            "Tuesday": [["Bicep Curls", "3x10"], ["Hammer Curls", "3x10"], ["Tricep Pushdowns", "3x10"], ["Overhead Extensions", "3x10"], ["Barbell Curls", "3x10"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Bench Press", "3x10"], ["Incline DB Press", "3x10"], ["Chest Flys", "3x10"], ["Leg Raises", "3x15"], ["Plank", "60s"]],
            "Friday": [["Bench Press", "3x10"], ["Incline DB Press", "3x10"], ["Chest Flys", "3x10"], ["Leg Raises", "3x15"], ["Plank", "60s"]],
            "Saturday": [["Back Squats", "3x10"], ["Leg Press", "3x10"], ["Calf Raises", "3x15"], ["Leg Extensions", "3x10"]],
            "Sunday": "Rest Day"
        },
        "Calisthenics": {
            "Monday": [["Push ups", "3x10"], ["Inclined push ups", "3x10"], ["Dips", "3x10"], ["Pull ups (close)", "3x10"], ["Pull ups (wide)", "3x10"], ["Muscle ups", "3x10"]],
            "Tuesday": [["Push ups", "3x10"], ["Inclined push ups", "3x10"], ["Dips", "3x10"], ["Pull ups (close)", "3x10"], ["Pull ups (wide)", "3x10"], ["Muscle ups", "3x10"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Push ups", "3x10"], ["Diamond push ups", "3x10"], ["Plank hold", "30-40s"], ["Crunches", "3x10"], ["Frog stand", "20-30s"]],
            "Friday": [["Push ups", "3x10"], ["Diamond push ups", "3x10"], ["Plank hold", "30-40s"], ["Crunches", "3x10"], ["Frog stand", "20-30s"]],
            "Saturday": [["Squats", "3x10"], ["Mountain climbers", "3x30"], ["Jog/run", "30 mins"]],
            "Sunday": "Rest Day"
        }
    },
    "Hard": {
        "Gym": {
            "Monday": [["Bicep Curls", "4x10"], ["Hammer Curls", "4x10"], ["Tricep Pushdowns", "4x10"], ["Overhead Extensions", "4x10"], ["Barbell Curls", "4x10"]],
            "Tuesday": [["Bicep Curls", "4x10"], ["Hammer Curls", "4x10"], ["Tricep Pushdowns", "4x10"], ["Overhead Extensions", "4x10"], ["Barbell Curls", "4x10"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Bench Press", "4x10"], ["Incline DB Press", "4x10"], ["Chest Flys", "4x10"], ["Leg Raises", "4x20"], ["Plank", "90s"]],
            "Friday": [["Bench Press", "4x10"], ["Incline DB Press", "4x10"], ["Chest Flys", "4x10"], ["Leg Raises", "4x20"], ["Plank", "90s"]],
            "Saturday": [["Back Squats", "4x10"], ["Leg Press", "4x10"], ["Calf Raises", "4x20"], ["Leg Extensions", "4x10"]],
            "Sunday": "Rest Day"
        },
        "Calisthenics": {
            "Monday": [["Push ups", "4x10"], ["Inclined push ups", "4x10"], ["Dips", "4x10"], ["Pull ups (close)", "4x10"], ["Pull ups (wide)", "4x10"], ["Muscle ups", "4x10"]],
            "Tuesday": [["Push ups", "4x10"], ["Inclined push ups", "4x10"], ["Dips", "4x10"], ["Pull ups (close)", "4x10"], ["Pull ups (wide)", "4x10"], ["Muscle ups", "4x10"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Push ups", "4x10"], ["Diamond push ups", "4x10"], ["Plank hold", "60s"], ["Crunches", "4x10"], ["Frog stand", "40-50s"]],
            "Friday": [["Push ups", "4x10"], ["Diamond push ups", "4x10"], ["Plank hold", "60s"], ["Crunches", "4x10"], ["Frog stand", "40-50s"]],
            "Saturday": [["Squats", "4x10"], ["Mountain climbers", "4x30"], ["Jog/run", "45 mins"]],
            "Sunday": "Rest Day"
        }
    }
};

// Discord OAuth Routes
async function handleDiscordCallback(req, res) {
    const { code } = req.query;
    if (!code) return res.redirect('/?error=no_code');

    try {
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: process.env.DISCORD_REDIRECT_URI,
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const { access_token } = tokenResponse.data;
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const discordUser = userResponse.data;

        req.session.user = {
            id: discordUser.id,
            username: discordUser.username,
            avatar: discordUser.avatar
                ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
                : `https://cdn.discordapp.com/embed/avatars/${discordUser.discriminator % 5}.png`
        };

        res.redirect('/dashboard.html');
    } catch (error) {
        console.error('OAuth Callback Error:', error.response?.data || error.message);
        res.redirect('/?error=auth_failed');
    }
}

app.get(['/auth/discord', '/api/auth/login'], (req, res) => {
    const redirectUri = encodeURIComponent(process.env.DISCORD_REDIRECT_URI);
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=identify`;
    res.redirect(discordAuthUrl);
});

app.get('/auth/discord/callback', handleDiscordCallback);
app.get('/api/auth/callback', handleDiscordCallback);

app.get('/auth/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// API Dashboard Route
app.get('/api/dashboard', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const numericUserId = parseInt(userId);

        const userStats = await db.collection('user_stats').findOne({
            $or: [{ _id: userId }, { _id: numericUserId }]
        });

        const userFlexDoc = await db.collection('user_flexes').findOne({
            $or: [{ _id: userId }, { _id: numericUserId }]
        });

        const flexesList = userFlexDoc?.flexes || [];
        const activeFlexes = flexesList.filter(f => !f.exercise.includes('(archived)'));
        const archivedFlexes = flexesList.filter(f => f.exercise.includes('(archived)'));

        const customWorkoutDoc = await db.collection('custom_workouts_v2').findOne({
            $or: [{ _id: userId }, { _id: numericUserId }]
        });

        const schedules = customWorkoutDoc?.schedules || [];

        const flexCount = userStats?.workout_count || flexesList.length || 0;
        let rank = "Beginner";
        if (flexCount >= 30) rank = "Hard";
        else if (flexCount >= 10) rank = "Intermediate";

        const defaultRoutine = DEFAULT_ROUTINES[rank] || DEFAULT_ROUTINES["Beginner"];

        const dietList = [
            { id: 1, name: "Chicken Breast (200g)", protein: 62, calories: 330, category: "Non-Veg" },
            { id: 2, name: "Whey Protein (1 Scoop)", protein: 25, calories: 120, category: "Supplement" },
            { id: 3, name: "Cottage Cheese (150g)", protein: 28, calories: 390, category: "Veg" },
            { id: 4, name: "Parmesan Cheese (50g)", protein: 18, calories: 215, category: "Veg" },
            { id: 5, name: "Low-Fat Mozzarella (100g)", protein: 24, calories: 250, category: "Veg" },
            { id: 6, name: "Greek Yogurt (200g)", protein: 20, calories: 150, category: "Veg" },
            { id: 7, name: "Boiled Eggs (4 Whole)", protein: 24, calories: 280, category: "Non-Veg" },
            { id: 8, name: "Soya Chunks (50g)", protein: 26, calories: 170, category: "Veg" }
        ];

        res.json({
            user: {
                username: req.session.user.username,
                avatar: req.session.user.avatar,
                flexes: flexCount,
                rank: rank
            },
            activeFlexes: activeFlexes,
            archivedFlexes: archivedFlexes,
            defaultRoutine: defaultRoutine,
            schedules: schedules,
            diet: dietList
        });

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

// Helper to find custom workout document
async function getCustomWorkoutDoc(userId) {
    const numericUserId = parseInt(userId);
    return await db.collection('custom_workouts_v2').findOne({
        $or: [{ _id: userId }, { _id: numericUserId }]
    });
}

// --- API Endpoints for Custom Workout Schedules & Exercises ---

// 1. ADD NEW SCHEDULE
app.post('/api/workout/schedule/add', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const numericUserId = parseInt(userId);
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Schedule name is required.' });
        }

        const newSchedule = {
            name: name.trim(),
            days: {
                "Monday": [],
                "Tuesday": [],
                "Wednesday": [],
                "Thursday": [],
                "Friday": [],
                "Saturday": [],
                "Sunday": []
            }
        };

        const userDoc = await getCustomWorkoutDoc(userId);
        const targetId = userDoc ? userDoc._id : numericUserId;

        await db.collection('custom_workouts_v2').updateOne(
            { _id: targetId },
            { $push: { schedules: newSchedule } },
            { upsert: true }
        );

        const updatedDoc = await getCustomWorkoutDoc(userId);
        res.json({ success: true, message: 'New schedule created!', schedules: updatedDoc?.schedules || [] });
    } catch (error) {
        console.error('Error adding schedule:', error);
        res.status(500).json({ error: 'Failed to create schedule.' });
    }
});

// 2. RENAME SCHEDULE
app.put('/api/workout/schedule/rename', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { scheduleIndex, newName } = req.body;

        if (scheduleIndex === undefined || !newName || !newName.trim()) {
            return res.status(400).json({ error: 'Schedule index and new name are required.' });
        }

        const userDoc = await getCustomWorkoutDoc(userId);
        if (!userDoc || !userDoc.schedules || !userDoc.schedules[scheduleIndex]) {
            return res.status(404).json({ error: 'Schedule not found.' });
        }

        const schedules = userDoc.schedules;
        schedules[scheduleIndex].name = newName.trim();

        await db.collection('custom_workouts_v2').updateOne(
            { _id: userDoc._id },
            { $set: { schedules: schedules } }
        );

        res.json({ success: true, message: 'Schedule renamed successfully.', schedules });
    } catch (error) {
        console.error('Error renaming schedule:', error);
        res.status(500).json({ error: 'Failed to rename schedule.' });
    }
});

// 3. DELETE SPECIFIC SCHEDULE
app.delete('/api/workout/schedule/delete', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { scheduleIndex } = req.body;

        if (scheduleIndex === undefined) {
            return res.status(400).json({ error: 'Schedule index is required.' });
        }

        const userDoc = await getCustomWorkoutDoc(userId);
        if (!userDoc || !userDoc.schedules || scheduleIndex >= userDoc.schedules.length) {
            return res.status(404).json({ error: 'Schedule not found.' });
        }

        const schedules = userDoc.schedules;
        schedules.splice(scheduleIndex, 1);

        await db.collection('custom_workouts_v2').updateOne(
            { _id: userDoc._id },
            { $set: { schedules: schedules } }
        );

        res.json({ success: true, message: 'Schedule deleted successfully.', schedules });
    } catch (error) {
        console.error('Error deleting schedule:', error);
        res.status(500).json({ error: 'Failed to delete schedule.' });
    }
});

// 4. ADD EXERCISE TO SCHEDULE DAY
app.post('/api/workout/exercise/add', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { scheduleIndex, day, exercise, reps } = req.body;

        if (scheduleIndex === undefined || !day || !exercise || !reps) {
            return res.status(400).json({ error: 'Schedule index, day, exercise name, and reps are required.' });
        }

        const userDoc = await getCustomWorkoutDoc(userId);
        if (!userDoc || !userDoc.schedules || !userDoc.schedules[scheduleIndex]) {
            return res.status(404).json({ error: 'Target schedule not found.' });
        }

        const schedules = userDoc.schedules;
        const cleanExercise = exercise.trim().startsWith('🧩') ? exercise.trim() : `🧩 ${exercise.trim()}`;

        if (!schedules[scheduleIndex].days) {
            schedules[scheduleIndex].days = { "Monday": [], "Tuesday": [], "Wednesday": [], "Thursday": [], "Friday": [], "Saturday": [], "Sunday": [] };
        }
        if (!schedules[scheduleIndex].days[day]) {
            schedules[scheduleIndex].days[day] = [];
        }

        const entry = { exercise: cleanExercise, reps: reps.trim() };
        schedules[scheduleIndex].days[day].push(entry);

        await db.collection('custom_workouts_v2').updateOne(
            { _id: userDoc._id },
            { $set: { schedules: schedules } }
        );

        res.json({ success: true, message: `Exercise added to ${day}!`, schedules });
    } catch (error) {
        console.error('Error adding exercise:', error);
        res.status(500).json({ error: 'Failed to add exercise.' });
    }
});

// 5. EDIT EXERCISE IN SCHEDULE DAY
app.put('/api/workout/exercise/edit', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { scheduleIndex, day, exerciseIndex, newExercise, newReps } = req.body;

        if (scheduleIndex === undefined || !day || exerciseIndex === undefined || !newExercise || !newReps) {
            return res.status(400).json({ error: 'All fields are required for editing an exercise.' });
        }

        const userDoc = await getCustomWorkoutDoc(userId);
        if (!userDoc || !userDoc.schedules || !userDoc.schedules[scheduleIndex]) {
            return res.status(404).json({ error: 'Target schedule not found.' });
        }

        const schedules = userDoc.schedules;
        const dayExercises = schedules[scheduleIndex].days?.[day];

        if (!dayExercises || exerciseIndex >= dayExercises.length) {
            return res.status(404).json({ error: 'Target exercise not found.' });
        }

        const cleanExercise = newExercise.trim().startsWith('🧩') ? newExercise.trim() : `🧩 ${newExercise.trim()}`;
        dayExercises[exerciseIndex] = { exercise: cleanExercise, reps: newReps.trim() };

        await db.collection('custom_workouts_v2').updateOne(
            { _id: userDoc._id },
            { $set: { schedules: schedules } }
        );

        res.json({ success: true, message: 'Exercise updated successfully.', schedules });
    } catch (error) {
        console.error('Error editing exercise:', error);
        res.status(500).json({ error: 'Failed to edit exercise.' });
    }
});

// 6. DELETE EXERCISE FROM SCHEDULE DAY
app.delete('/api/workout/exercise/delete', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { scheduleIndex, day, exerciseIndex } = req.body;

        if (scheduleIndex === undefined || !day || exerciseIndex === undefined) {
            return res.status(400).json({ error: 'Schedule index, day, and exercise index are required.' });
        }

        const userDoc = await getCustomWorkoutDoc(userId);
        if (!userDoc || !userDoc.schedules || !userDoc.schedules[scheduleIndex]) {
            return res.status(404).json({ error: 'Target schedule not found.' });
        }

        const schedules = userDoc.schedules;
        const dayExercises = schedules[scheduleIndex].days?.[day];

        if (!dayExercises || exerciseIndex >= dayExercises.length) {
            return res.status(404).json({ error: 'Target exercise not found.' });
        }

        dayExercises.splice(exerciseIndex, 1);

        await db.collection('custom_workouts_v2').updateOne(
            { _id: userDoc._id },
            { $set: { schedules: schedules } }
        );

        res.json({ success: true, message: 'Exercise removed.', schedules });
    } catch (error) {
        console.error('Error deleting exercise:', error);
        res.status(500).json({ error: 'Failed to delete exercise.' });
    }
});

// 7. CLEAR ALL WORKOUT SCHEDULES
app.delete('/api/workout/delete', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const numericUserId = parseInt(userId);

        await db.collection('custom_workouts_v2').updateOne(
            { $or: [{ _id: userId }, { _id: numericUserId }] },
            { $set: { schedules: [] } }
        );

        res.json({ success: true, message: 'All workout schedules deleted successfully.' });
    } catch (error) {
        console.error('Error deleting workouts:', error);
        res.status(500).json({ error: 'Failed to delete workout plans.' });
    }
});

// --- Helper Functions matching flex_cog.py ---
function normalizeName(name) {
    return name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function getFancyDate() {
    const now = new Date();
    const day = now.getDate();
    let suffix = 'th';
    if (day < 11 || day > 13) {
        if (day % 10 === 1) suffix = 'st';
        else if (day % 10 === 2) suffix = 'nd';
        else if (day % 10 === 3) suffix = 'rd';
    }
    const month = now.toLocaleString('en-US', { month: 'long' });
    return `${month} ${day}${suffix}, ${now.getFullYear()}`;
}

function getGraphDate() {
    const now = new Date();
    return now.toLocaleString('en-US', { month: 'short', day: '2-digit' });
}

// Helper to find document across String or Int _id
async function getUserFlexDoc(userId) {
    const numericUserId = parseInt(userId);
    return await db.collection('user_flexes').findOne({
        $or: [{ _id: userId }, { _id: numericUserId }]
    });
}

// --- API Endpoints for Flexes ---

// 1. ADD FLEX (Automatically archives previous flexes with the same normalized name)
app.post('/api/flex/add', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const numericUserId = parseInt(userId);
        const { exercise, stat } = req.body;

        if (!exercise || !stat) {
            return res.status(400).json({ error: 'Exercise and Stat are required.' });
        }

        const rawName = exercise.trim();
        const normName = normalizeName(rawName);
        const newStat = stat.trim();
        const fancyDate = getFancyDate();
        const graphLabel = getGraphDate();
        const nowIso = new Date().toISOString();

        const userDoc = await getUserFlexDoc(userId);
        let flexes = userDoc?.flexes || [];

        // Automatically archive any existing active flex with matching normalized exercise name
        flexes = flexes.map(f => {
            if (normalizeName(f.exercise) === normName && !f.exercise.includes('(archived)')) {
                return { ...f, exercise: `${f.exercise} (archived)` };
            }
            return f;
        });

        // Add the new active flex entry
        const newEntry = {
            exercise: rawName,
            stat: newStat,
            timestamp: fancyDate,
            graph_date: graphLabel,
            raw_ts: nowIso
        };
        flexes.push(newEntry);

        const targetId = userDoc ? userDoc._id : numericUserId;
        await db.collection('user_flexes').updateOne(
            { _id: targetId },
            { $set: { flexes: flexes } },
            { upsert: true }
        );

        // Update user workout counter in user_stats
        await db.collection('user_stats').updateOne(
            { $or: [{ _id: userId }, { _id: numericUserId }] },
            { $inc: { workout_count: 1 } },
            { upsert: true }
        );

        res.json({ success: true, message: 'Flex logged successfully!', entry: newEntry });
    } catch (error) {
        console.error('Error adding flex:', error);
        res.status(500).json({ error: 'Failed to add flex.' });
    }
});

// 2. EDIT FLEX STAT & EXERCISE
app.put('/api/flex/edit', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const exercise = req.body.exercise || req.body.targetItem?.exercise;
        const raw_ts = req.body.raw_ts || req.body.targetItem?.raw_ts;
        const newStat = req.body.newStat;
        const newExercise = req.body.newExercise || req.body.exercise;

        if (!exercise || (!newStat && !newExercise)) {
            return res.status(400).json({ error: 'Exercise target and updated values are required.' });
        }

        const userDoc = await getUserFlexDoc(userId);
        if (!userDoc || !userDoc.flexes) {
            return res.status(404).json({ error: 'No flex records found.' });
        }

        let updated = false;
        const updatedFlexes = userDoc.flexes.map(f => {
            const isMatch = raw_ts
                ? (f.exercise === exercise && f.raw_ts === raw_ts)
                : (f.exercise === exercise);

            if (isMatch) {
                updated = true;
                const isArchived = f.exercise.includes('(archived)');
                let updatedName = newExercise ? newExercise.trim() : f.exercise;
                if (isArchived && !updatedName.includes('(archived)')) {
                    updatedName = `${updatedName} (archived)`;
                }
                return {
                    ...f,
                    exercise: updatedName,
                    stat: newStat ? newStat.trim() : f.stat
                };
            }
            return f;
        });

        if (!updated) {
            return res.status(404).json({ error: 'Target flex not found.' });
        }

        await db.collection('user_flexes').updateOne(
            { _id: userDoc._id },
            { $set: { flexes: updatedFlexes } }
        );

        res.json({ success: true, message: 'Flex updated successfully.' });
    } catch (error) {
        console.error('Error editing flex:', error);
        res.status(500).json({ error: 'Failed to edit flex.' });
    }
});

// 3. ARCHIVE FLEX
app.post('/api/flex/archive', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { exercise, raw_ts } = req.body;

        if (!exercise) {
            return res.status(400).json({ error: 'Exercise target is required.' });
        }

        const userDoc = await getUserFlexDoc(userId);
        if (!userDoc || !userDoc.flexes) {
            return res.status(404).json({ error: 'No flex records found.' });
        }

        let updated = false;
        const updatedFlexes = userDoc.flexes.map(f => {
            const isMatch = raw_ts
                ? (f.exercise === exercise && f.raw_ts === raw_ts)
                : (f.exercise === exercise);

            if (isMatch) {
                updated = true;
                if (!f.exercise.includes('(archived)')) {
                    return { ...f, exercise: `${f.exercise} (archived)` };
                }
            }
            return f;
        });

        if (!updated) {
            return res.status(404).json({ error: 'Flex entry not found.' });
        }

        await db.collection('user_flexes').updateOne(
            { _id: userDoc._id },
            { $set: { flexes: updatedFlexes } }
        );

        res.json({ success: true, message: 'Flex archived successfully.' });
    } catch (error) {
        console.error('Error archiving flex:', error);
        res.status(500).json({ error: 'Failed to archive flex.' });
    }
});

// 4. UNARCHIVE FLEX
app.post('/api/flex/unarchive', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { exercise, raw_ts } = req.body;

        if (!exercise) {
            return res.status(400).json({ error: 'Exercise target is required.' });
        }

        const userDoc = await getUserFlexDoc(userId);
        if (!userDoc || !userDoc.flexes) {
            return res.status(404).json({ error: 'No flex records found.' });
        }

        const cleanTargetName = exercise.replace('(archived)', '').trim();
        const targetNorm = normalizeName(cleanTargetName);

        // First archive any existing active flex with matching normalized exercise name
        let flexes = userDoc.flexes.map(f => {
            if (normalizeName(f.exercise) === targetNorm && !f.exercise.includes('(archived)')) {
                return { ...f, exercise: `${f.exercise} (archived)` };
            }
            return f;
        });

        // Now set the target flex to active (strip archived tag)
        let updated = false;
        flexes = flexes.map(f => {
            const isMatch = raw_ts
                ? (f.exercise === exercise && f.raw_ts === raw_ts)
                : (f.exercise === exercise);

            if (isMatch) {
                updated = true;
                return { ...f, exercise: cleanTargetName };
            }
            return f;
        });

        if (!updated) {
            return res.status(404).json({ error: 'Flex entry not found.' });
        }

        await db.collection('user_flexes').updateOne(
            { _id: userDoc._id },
            { $set: { flexes: flexes } }
        );

        res.json({ success: true, message: 'Flex unarchived successfully.' });
    } catch (error) {
        console.error('Error unarchiving flex:', error);
        res.status(500).json({ error: 'Failed to unarchive flex.' });
    }
});

// 5. DELETE SINGLE FLEX
app.delete('/api/flex/delete', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        // Supports both direct parameters or nested targetItem
        const exercise = req.body.exercise || req.body.targetItem?.exercise;
        const raw_ts = req.body.raw_ts || req.body.targetItem?.raw_ts;

        if (!exercise) {
            return res.status(400).json({ error: 'Exercise target is required.' });
        }

        const userDoc = await getUserFlexDoc(userId);
        if (!userDoc || !userDoc.flexes) {
            return res.status(404).json({ error: 'No flex records found.' });
        }

        const initialLength = userDoc.flexes.length;
        const updatedFlexes = userDoc.flexes.filter(f => {
            if (raw_ts) {
                return !(f.exercise === exercise && f.raw_ts === raw_ts);
            }
            return f.exercise !== exercise;
        });

        if (updatedFlexes.length === initialLength) {
            return res.status(404).json({ error: 'Flex entry not found.' });
        }

        await db.collection('user_flexes').updateOne(
            { _id: userDoc._id },
            { $set: { flexes: updatedFlexes } }
        );

        res.json({ success: true, message: 'Flex deleted successfully.' });
    } catch (error) {
        console.error('Error deleting flex:', error);
        res.status(500).json({ error: 'Failed to delete flex.' });
    }
});

// 6. CLEAR ALL FLEXES
app.delete('/api/flex/clear-all', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userDoc = await getUserFlexDoc(userId);

        if (userDoc) {
            await db.collection('user_flexes').updateOne(
                { _id: userDoc._id },
                { $set: { flexes: [] } }
            );
        }

        res.json({ success: true, message: 'All flexes cleared.' });
    } catch (error) {
        console.error('Error clearing flexes:', error);
        res.status(500).json({ error: 'Failed to clear flexes.' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Gladiator Dashboard running on http://localhost:${PORT}`);
});