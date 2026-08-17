const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { MongoClient, Long } = require('mongodb');
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
let remindersDb;

async function connectDB() {
    try {
        await mongoClient.connect();
        db = mongoClient.db('GymBotDB');
        // The bot's reminder_cog.py stores reminders in a separate database
        // from everything else (gladiator_db, not GymBotDB) - keep a second
        // handle for it rather than assuming it's in the same place.
        remindersDb = mongoClient.db('gladiator_db');
        console.log('✅ Connected to MongoDB (GymBotDB + gladiator_db)');
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

// --- RANK ASSIGNMENT & DEFAULT ROUTINES MATCHING workout_cog.py ---
function calculateRank(workoutCount) {
    if (workoutCount >= 1000) return "Gladiator Maximus";
    if (workoutCount >= 810) return "Titan Ascendant";
    if (workoutCount >= 600) return "Apex Centurion";
    if (workoutCount >= 390) return "Gold Gladiator";
    if (workoutCount >= 330) return "Arena Master";
    if (workoutCount >= 240) return "Gilded Champion";
    if (workoutCount >= 150) return "Steel Centurion";
    if (workoutCount >= 120) return "Iron Vanguard";
    if (workoutCount >= 60) return "Bronze Legionnaire";
    return "Novice / Beginner";
}

const DEFAULT_ROUTINES = {
    "Novice / Beginner": {
        "Gym": {
            "Monday": [["Arm + neck rotation", "10x1"], ["Dumbbell bicep curls (8 kgs/17 lbs)", "10x3"], ["Hammer curls (8 kgs/17 lbs)", "10x3"]],
            "Tuesday": [["Arm + neck rotation", "10x1"], ["Dumbbell bicep curls (8 kgs/17 lbs)", "10x3"], ["Hammer curls (8 kgs/17 lbs)", "10x3"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Arm + neck rotation", "10x1"], ["Crunches / Ab crunch machine", "7x1"], ["Seated Cable row", "7x1"]],
            "Friday": [["Arm + neck rotation", "10x1"], ["Crunches / Ab crunch machine", "7x1"], ["Seated Cable row", "7x1"]],
            "Saturday": [["Arm + neck rotation", "10x1"], ["Bodyweight squats", "7x1"], ["Weighted squats (3kg/6.5lbs)", "7x1"], ["Treadmill", "5 minutes"]],
            "Sunday": "Rest Day"
        },
        "Calisthenics": {
            "Monday": [["Arm + neck rotation", "10x1"], ["Push Ups", "7x1"], ["Elevated push ups", "7x1"]],
            "Tuesday": [["Arm + neck rotation", "10x1"], ["Push Ups", "7x1"], ["Elevated push ups", "7x1"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Arm + neck rotation", "10x1"], ["Crunches", "7x1"], ["Plank", "1 set"]],
            "Friday": [["Arm + neck rotation", "10x1"], ["Crunches", "7x1"], ["Plank", "1 set"]],
            "Saturday": [["Arm + neck rotation", "10x1"], ["Bodyweight squats", "7x1"], ["Bodyweight lunges", "7x1"], ["Running", "5 minutes"]],
            "Sunday": "Rest Day"
        }
    },
    "Bronze Legionnaire": {
        "Gym": {
            "Monday": [["Arm + neck rotation", "10x1"], ["Dumbbell bicep curls (8 kgs/17 lbs)", "10x2"], ["Hammer curls (8 kgs/17 lbs)", "10x2"], ["Overhead Triceps extension", "10x2"], ["Preacher curls", "10x2"]],
            "Tuesday": [["Arm + neck rotation", "10x1"], ["Dumbbell bicep curls (8 kgs/17 lbs)", "10x2"], ["Hammer curls (8 kgs/17 lbs)", "10x2"], ["Overhead Triceps extension", "10x2"], ["Preacher curls", "10x2"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Arm + neck rotation", "10x1"], ["Crunches / Ab crunch machine", "10x2"], ["Seated Cable row", "10x2"], ["Cable lats pulldown", "10x2"]],
            "Friday": [["Arm + neck rotation", "10x1"], ["Crunches / Ab crunch machine", "10x2"], ["Seated Cable row", "10x2"], ["Cable lats pulldown", "10x2"]],
            "Saturday": [["Arm + neck rotation", "10x1"], ["Weighted squats", "10x2"], ["Leg press", "10x2"], ["Leg extension", "10x2"]],
            "Sunday": "Rest Day"
        },
        "Calisthenics": {
            "Monday": [["Arm + neck rotation", "10x1"], ["Push Ups", "10x2"], ["Elevated push ups", "10x2"], ["Chair assisted dips", "10x2"], ["Pull ups", "10x2"]],
            "Tuesday": [["Arm + neck rotation", "10x1"], ["Push Ups", "10x2"], ["Elevated push ups", "10x2"], ["Chair assisted dips", "10x2"], ["Pull ups", "10x2"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Arm + neck rotation", "10x1"], ["Crunches", "10x2"], ["Twist crunches", "10x2"], ["Push ups", "10x2"], ["Plank", "2 sets"]],
            "Friday": [["Arm + neck rotation", "10x1"], ["Crunches", "10x2"], ["Twist crunches", "10x2"], ["Push ups", "10x2"], ["Plank", "2 sets"]],
            "Saturday": [["Arm + neck rotation", "10x1"], ["Bodyweight squats", "10x2"], ["Bodyweight lunges", "10x2"], ["Jumping", "10x2"], ["Running", "10 minutes"]],
            "Sunday": "Rest Day"
        }
    },
    "Iron Vanguard": {
        "Gym": {
            "Monday": [["Arm + neck rotation", "10x1"], ["Dumbbell bicep curls (8 kgs/17 lbs)", "10x3"], ["Hammer curls (8 kgs/17 lbs)", "10x3"], ["Overhead Triceps extension", "10x3"], ["Preacher curls", "10x3"]],
            "Tuesday": [["Arm + neck rotation", "10x1"], ["Dumbbell bicep curls (8 kgs/17 lbs)", "10x3"], ["Hammer curls (8 kgs/17 lbs)", "10x3"], ["Overhead Triceps extension", "10x3"], ["Preacher curls", "10x3"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Arm + neck rotation", "10x1"], ["Crunches / Ab crunch machine", "10x3"], ["Seated Cable row", "10x3"], ["Cable lats pulldown", "10x3"], ["Pec dec", "10x3"], ["Bench press (10-15 kgs/22-33 lbs)", "2x5"]],
            "Friday": [["Arm + neck rotation", "10x1"], ["Crunches / Ab crunch machine", "10x3"], ["Seated Cable row", "10x3"], ["Cable lats pulldown", "10x3"], ["Pec dec", "10x3"], ["Bench press (10-15 kgs/22-33 lbs)", "2x5"]],
            "Saturday": [["Arm + neck rotation", "10x1"], ["Weighted squats", "10x2"], ["Leg press", "10x2"], ["Leg extension", "10x2"], ["Incline leg press", "10x2"], ["Seated leg curl", "10x2"]],
            "Sunday": "Rest Day"
        },
        "Calisthenics": {
            "Monday": [["Arm + neck rotation", "10x1"], ["Push Ups", "10x2"], ["Frog stand with parallettes", "2 sets"], ["Pull ups", "10x3"], ["Chin ups", "10x3"]],
            "Tuesday": [["Arm + neck rotation", "10x1"], ["Push Ups", "10x2"], ["Frog stand with parallettes", "2 sets"], ["Pull ups", "10x3"], ["Chin ups", "10x3"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Arm + neck rotation", "10x1"], ["Crunches", "10x2"], ["Twist crunches", "10x2"], ["Push ups", "10x2"], ["Inclined push ups", "10x2"], ["Hindu push ups", "10x1"], ["Chair assisted dips", "10x2"]],
            "Friday": [["Arm + neck rotation", "10x1"], ["Crunches", "10x2"], ["Twist crunches", "10x2"], ["Push ups", "10x2"], ["Inclined push ups", "10x2"], ["Hindu push ups", "10x1"], ["Chair assisted dips", "10x2"]],
            "Saturday": [["Arm + neck rotation", "10x1"], ["Bodyweight squats", "10x3"], ["Weighted squats", "1 set"], ["Jumping", "10x3"], ["Running", "20 minutes"]],
            "Sunday": "Rest Day"
        }
    },
    "Steel Centurion": {
        "Gym": {
            "Monday": [["Arm + neck rotation", "10x1"], ["Dumbbell bicep curls (8 kgs/17 lbs)", "10x3"], ["Hammer curls (8 kgs/17 lbs)", "10x3"], ["Overhead Triceps extension", "10x3"], ["Preacher curls", "10x3"], ["Overhead press", "10x3"]],
            "Tuesday": [["Arm + neck rotation", "10x1"], ["Dumbbell bicep curls (8 kgs/17 lbs)", "10x3"], ["Hammer curls (8 kgs/17 lbs)", "10x3"], ["Overhead Triceps extension", "10x3"], ["Preacher curls", "10x3"], ["Overhead press", "10x3"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Arm + neck rotation", "10x1"], ["Crunches / Ab crunch machine", "10x3"], ["Seated Cable row", "10x3"], ["Cable lats pulldown", "10x3"], ["Pec dec", "10x3"], ["Bench press (20-40 kgs/44-88 lbs)", "2x5"]],
            "Friday": [["Arm + neck rotation", "10x1"], ["Crunches / Ab crunch machine", "10x3"], ["Seated Cable row", "10x3"], ["Cable lats pulldown", "10x3"], ["Pec dec", "10x3"], ["Bench press (20-40 kgs/44-88 lbs)", "2x5"]],
            "Saturday": [["Arm + neck rotation", "10x1"], ["Weighted squats", "10x3"], ["Leg press", "10x3"], ["Leg extension", "10x3"], ["Incline leg press", "10x3"], ["Seated leg curl", "10x3"]],
            "Sunday": "Rest Day"
        },
        "Calisthenics": {
            "Monday": [["Arm + neck rotation", "10x1"], ["Push Ups", "10x3"], ["Pull ups", "10x3"], ["Chin ups", "10x3"], ["Frog stand with parallettes", "3 sets"]],
            "Tuesday": [["Arm + neck rotation", "10x1"], ["Push Ups", "10x3"], ["Pull ups", "10x3"], ["Chin ups", "10x3"], ["Frog stand with parallettes", "3 sets"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Arm + neck rotation", "10x1"], ["Crunches", "10x3"], ["Twist crunches", "10x3"], ["Push ups", "10x3"], ["Inclined push ups", "10x3"], ["Hindu push ups", "10x3"], ["Chair assisted dips", "10x3"], ["L-sit", "2 sets"]],
            "Friday": [["Arm + neck rotation", "10x1"], ["Crunches", "10x3"], ["Twist crunches", "10x3"], ["Push ups", "10x3"], ["Inclined push ups", "10x3"], ["Hindu push ups", "10x3"], ["Chair assisted dips", "10x3"], ["L-sit", "2 sets"]],
            "Saturday": [["Arm + neck rotation", "10x1"], ["Bodyweight squats", "10x3"], ["Weighted squats", "10x3"], ["Jumping", "10x3"], ["Running", "30 minutes"]],
            "Sunday": "Rest Day"
        }
    },
    "Gilded Champion": {
        "Gym": {
            "Monday": [["Arm + neck rotation", "10x1"], ["Dumbbell bicep curls (8 kgs/17 lbs)", "10x4"], ["Hammer curls (8 kgs/17 lbs)", "10x4"], ["Overhead Triceps extension", "10x4"], ["Preacher curls", "10x4"], ["Overhead press", "10x4"]],
            "Tuesday": [["Arm + neck rotation", "10x1"], ["Dumbbell bicep curls (8 kgs/17 lbs)", "10x4"], ["Hammer curls (8 kgs/17 lbs)", "10x4"], ["Overhead Triceps extension", "10x4"], ["Preacher curls", "10x4"], ["Overhead press", "10x4"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Arm + neck rotation", "10x1"], ["Crunches / Ab crunch machine", "10x4"], ["Seated Cable row", "10x4"], ["Cable lats pulldown", "10x4"], ["Pec dec", "10x4"], ["Bench press (20-40 kgs/44-88 lbs)", "2x5"]],
            "Friday": [["Arm + neck rotation", "10x1"], ["Crunches / Ab crunch machine", "10x4"], ["Seated Cable row", "10x4"], ["Cable lats pulldown", "10x4"], ["Pec dec", "10x4"], ["Bench press (20-40 kgs/44-88 lbs)", "2x5"]],
            "Saturday": [["Arm + neck rotation", "10x1"], ["Weighted squats", "10x3"], ["Leg press", "10x3"], ["Leg extension", "10x3"], ["Incline leg press", "10x3"], ["Seated leg curl", "10x3"]],
            "Sunday": "Rest Day"
        },
        "Calisthenics": {
            "Monday": [["Arm + neck rotation", "10x1"], ["Push Ups", "10x4"], ["Pull ups", "10x4"], ["Chin ups", "10x4"], ["Frog stand with parallettes", "2 sets"], ["Tuck front lever hold", "2 sets"]],
            "Tuesday": [["Arm + neck rotation", "10x1"], ["Push Ups", "10x4"], ["Pull ups", "10x4"], ["Chin ups", "10x4"], ["Frog stand with parallettes", "2 sets"], ["Tuck front lever hold", "2 sets"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Arm + neck rotation", "10x1"], ["Crunches", "10x4"], ["Twist crunches", "10x4"], ["Push ups", "10x4"], ["Inclined push ups", "10x4"], ["Hindu push ups", "10x4"], ["Chair assisted dips", "10x4"], ["L-sit", "2 sets"]],
            "Friday": [["Arm + neck rotation", "10x1"], ["Crunches", "10x4"], ["Twist crunches", "10x4"], ["Push ups", "10x4"], ["Inclined push ups", "10x4"], ["Hindu push ups", "10x4"], ["Chair assisted dips", "10x4"], ["L-sit", "2 sets"]],
            "Saturday": [["Arm + neck rotation", "10x1"], ["Bodyweight squats", "10x3"], ["Weighted squats", "10x3"], ["Jumping", "10x3"], ["Running", "40 minutes"]],
            "Sunday": "Rest Day"
        }
    },
    "Arena Master": {
        "Gym": {
            "Monday": [["Arm + neck rotation", "10x1"], ["Dumbbell bicep curls (8 kgs/17 lbs)", "15x3"], ["Hammer curls (8 kgs/17 lbs)", "15x3"], ["Overhead Triceps extension", "15x3"], ["Preacher curls", "15x3"], ["Overhead press", "15x3"]],
            "Tuesday": [["Arm + neck rotation", "10x1"], ["Dumbbell bicep curls (8 kgs/17 lbs)", "15x3"], ["Hammer curls (8 kgs/17 lbs)", "15x3"], ["Overhead Triceps extension", "15x3"], ["Preacher curls", "15x3"], ["Overhead press", "15x3"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Arm + neck rotation", "10x1"], ["Pull ups", "10x2"], ["Crunches / Ab crunch machine", "15x3"], ["Seated Cable row", "15x3"], ["Cable lats pulldown", "15x3"], ["Pec dec", "15x3"], ["Bench press (20-40 kgs/44-88 lbs)", "2x5"]],
            "Friday": [["Arm + neck rotation", "10x1"], ["Pull ups", "10x2"], ["Crunches / Ab crunch machine", "15x3"], ["Seated Cable row", "15x3"], ["Cable lats pulldown", "15x3"], ["Pec dec", "15x3"], ["Bench press (20-40 kgs/44-88 lbs)", "2x5"]],
            "Saturday": [["Weighted squats", "10x3"], ["Leg press", "10x3"], ["Leg extension", "10x3"], ["Incline leg press", "10x3"], ["Seated leg curl", "10x3"]],
            "Sunday": "Rest Day"
        },
        "Calisthenics": {
            "Monday": [["Arm + neck rotation", "10x1"], ["Push Ups", "15x3"], ["Pull ups", "15x3"], ["Chin ups", "15x3"], ["Frog stand with parallettes", "2 sets"], ["Tuck front lever hold", "2 sets"], ["Negative front lever raises", "1x1"]],
            "Tuesday": [["Arm + neck rotation", "10x1"], ["Push Ups", "15x3"], ["Pull ups", "15x3"], ["Chin ups", "15x3"], ["Frog stand with parallettes", "2 sets"], ["Tuck front lever hold", "2 sets"], ["Negative front lever raises", "1x1"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Arm + neck rotation", "10x1"], ["Crunches", "15x3"], ["Twist crunches", "15x3"], ["Push ups", "15x3"], ["Inclined push ups", "15x3"], ["Hindu push ups", "15x3"], ["Chair assisted dips", "15x3"], ["L-sit", "2 sets"]],
            "Friday": [["Arm + neck rotation", "10x1"], ["Crunches", "15x3"], ["Twist crunches", "15x3"], ["Push ups", "15x3"], ["Inclined push ups", "15x3"], ["Hindu push ups", "15x3"], ["Chair assisted dips", "15x3"], ["L-sit", "2 sets"]],
            "Saturday": [["Arm + neck rotation", "10x1"], ["Bodyweight squats", "10x3"], ["Weighted squats", "10x3"], ["Jumping", "10x3"], ["Running", "30 minutes"]],
            "Sunday": "Rest Day"
        }
    },
    "Gold Gladiator": {
        "Gym": {
            "Monday": [["Arm + neck rotation", "10x1"], ["Dumbbell bicep curls (10 kgs/22 lbs)", "10x2"], ["Hammer curls (10 kgs/22 lbs)", "10x2"], ["Overhead Triceps extension", "10x2"], ["Preacher curls", "10x2"], ["Overhead press", "10x2"]],
            "Tuesday": [["Arm + neck rotation", "10x1"], ["Dumbbell bicep curls (10 kgs/22 lbs)", "10x2"], ["Hammer curls (10 kgs/22 lbs)", "10x2"], ["Overhead Triceps extension", "10x2"], ["Preacher curls", "10x2"], ["Overhead press", "10x2"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Arm + neck rotation", "10x1"], ["Pull ups", "10x3"], ["Crunches / Ab crunch machine", "10x2"], ["Seated Cable row", "10x2"], ["Cable lats pulldown", "10x2"], ["Pec dec", "10x2"], ["Bench press (20-40 kgs/44-88 lbs)", "2x5"]],
            "Friday": [["Arm + neck rotation", "10x1"], ["Pull ups", "10x3"], ["Crunches / Ab crunch machine", "10x2"], ["Seated Cable row", "10x2"], ["Cable lats pulldown", "10x2"], ["Pec dec", "10x2"], ["Bench press (20-40 kgs/44-88 lbs)", "2x5"]],
            "Saturday": [["Weighted squats", "10x3"], ["Leg press", "10x3"], ["Leg extension", "10x3"], ["Incline leg press", "10x3"], ["Seated leg curl", "10x3"]],
            "Sunday": "Rest Day"
        },
        "Calisthenics": {
            "Monday": [["Arm + neck rotation", "10x1"], ["Push Ups", "20x2"], ["Pull ups", "20x2"], ["Chin ups", "20x2"], ["Frog stand with parallettes", "2 sets"], ["advance tuck front lever hold", "2 sets"], ["Negative front lever raises", "3x1"]],
            "Tuesday": [["Arm + neck rotation", "10x1"], ["Push Ups", "20x2"], ["Pull ups", "20x2"], ["Chin ups", "20x2"], ["Frog stand with parallettes", "2 sets"], ["advance tuck front lever hold", "2 sets"], ["Negative front lever raises", "3x1"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Arm + neck rotation", "10x1"], ["Crunches", "15x2"], ["Twist crunches", "10x2"], ["Push ups", "20x2"], ["Inclined push ups", "20x2"], ["Hindu push ups", "20x2"], ["Chair assisted dips", "20x2"], ["L-sit", "2 sets"]],
            "Friday": [["Arm + neck rotation", "10x1"], ["Crunches", "15x2"], ["Twist crunches", "10x2"], ["Push ups", "20x2"], ["Inclined push ups", "20x2"], ["Hindu push ups", "20x2"], ["Chair assisted dips", "20x2"], ["L-sit", "2 sets"]],
            "Saturday": [["Arm + neck rotation", "10x1"], ["Bodyweight squats", "10x3"], ["Weighted squats", "10x3"], ["Jumping", "10x3"], ["Running", "30 minutes"]],
            "Sunday": "Rest Day"
        }
    },
    "Apex Centurion": {
        "Gym": {
            "Monday": [["Arm + neck rotation", "10x1"], ["Dumbbell bicep curls (10 kgs/22 lbs)", "10x2"], ["Hammer curls (10 kgs/22 lbs)", "10x2"], ["Overhead Triceps extension", "10x2"], ["Preacher curls", "10x2"], ["Overhead press", "10x2"]],
            "Tuesday": [["Arm + neck rotation", "10x1"], ["Dumbbell bicep curls (10 kgs/22 lbs)", "10x2"], ["Hammer curls (10 kgs/22 lbs)", "10x2"], ["Overhead Triceps extension", "10x2"], ["Preacher curls", "10x2"], ["Overhead press", "10x2"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Arm + neck rotation", "10x1"], ["Pull ups", "10x3"], ["Crunches / Ab crunch machine", "10x2"], ["Seated Cable row", "10x2"], ["Cable lats pulldown", "10x2"], ["Pec dec", "10x2"], ["Bench press (20-40 kgs/44-88 lbs)", "2x5"]],
            "Friday": [["Arm + neck rotation", "10x1"], ["Pull ups", "10x3"], ["Crunches / Ab crunch machine", "10x2"], ["Seated Cable row", "10x2"], ["Cable lats pulldown", "10x2"], ["Pec dec", "10x2"], ["Bench press (20-40 kgs/44-88 lbs)", "2x5"]],
            "Saturday": [["Weighted squats", "10x3"], ["Leg press", "10x3"], ["Leg extension", "10x3"], ["Incline leg press", "10x3"], ["Seated leg curl", "10x3"]],
            "Sunday": "Rest Day"
        },
        "Calisthenics": {
            "Monday": [["Arm + neck rotation", "10x1"], ["Push Ups", "20x2"], ["Pull ups", "20x2"], ["Chin ups", "20x2"], ["Frog stand with parallettes", "2 sets"], ["advance tuck front lever hold", "2 sets"], ["Negative front lever raises", "3x1"]],
            "Tuesday": [["Arm + neck rotation", "10x1"], ["Push Ups", "20x2"], ["Pull ups", "20x2"], ["Chin ups", "20x2"], ["Frog stand with parallettes", "2 sets"], ["advance tuck front lever hold", "2 sets"], ["Negative front lever raises", "3x1"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Arm + neck rotation", "10x1"], ["Crunches", "15x2"], ["Twist crunches", "10x2"], ["Push ups", "20x2"], ["Inclined push ups", "20x2"], ["Hindu push ups", "20x2"], ["Chair assisted dips", "20x2"], ["L-sit", "2 sets"]],
            "Friday": [["Arm + neck rotation", "10x1"], ["Crunches", "15x2"], ["Twist crunches", "10x2"], ["Push ups", "20x2"], ["Inclined push ups", "20x2"], ["Hindu push ups", "20x2"], ["Chair assisted dips", "20x2"], ["L-sit", "2 sets"]],
            "Saturday": [["Arm + neck rotation", "10x1"], ["Bodyweight squats", "10x3"], ["Weighted squats", "10x3"], ["Jumping", "10x3"], ["Running", "30 minutes"]],
            "Sunday": "Rest Day"
        }
    },
    "Titan Ascendant": {
        "Gym": {
            "Monday": [["Arm + neck rotation", "10x1"], ["Dumbbell bicep curls (10 kgs/22 lbs)", "10x2"], ["Hammer curls (10 kgs/22 lbs)", "10x2"], ["Overhead Triceps extension", "10x2"], ["Preacher curls", "10x2"], ["Overhead press", "10x2"]],
            "Tuesday": [["Arm + neck rotation", "10x1"], ["Dumbbell bicep curls (10 kgs/22 lbs)", "10x2"], ["Hammer curls (10 kgs/22 lbs)", "10x2"], ["Overhead Triceps extension", "10x2"], ["Preacher curls", "10x2"], ["Overhead press", "10x2"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Arm + neck rotation", "10x1"], ["Pull ups", "10x3"], ["Crunches / Ab crunch machine", "10x2"], ["Seated Cable row", "10x2"], ["Cable lats pulldown", "10x2"], ["Pec dec", "10x2"], ["Bench press (20-40 kgs/44-88 lbs)", "2x5"]],
            "Friday": [["Arm + neck rotation", "10x1"], ["Pull ups", "10x3"], ["Crunches / Ab crunch machine", "10x2"], ["Seated Cable row", "10x2"], ["Cable lats pulldown", "10x2"], ["Pec dec", "10x2"], ["Bench press (20-40 kgs/44-88 lbs)", "2x5"]],
            "Saturday": [["Weighted squats", "10x3"], ["Leg press", "10x3"], ["Leg extension", "10x3"], ["Incline leg press", "10x3"], ["Seated leg curl", "10x3"]],
            "Sunday": "Rest Day"
        },
        "Calisthenics": {
            "Monday": [["Arm + neck rotation", "10x1"], ["Push Ups", "20x2"], ["Pull ups", "20x2"], ["Chin ups", "20x2"], ["Frog stand with parallettes", "2 sets"], ["advance tuck front lever hold", "2 sets"], ["Negative front lever raises", "3x1"]],
            "Tuesday": [["Arm + neck rotation", "10x1"], ["Push Ups", "20x2"], ["Pull ups", "20x2"], ["Chin ups", "20x2"], ["Frog stand with parallettes", "2 sets"], ["advance tuck front lever hold", "2 sets"], ["Negative front lever raises", "3x1"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Arm + neck rotation", "10x1"], ["Crunches", "15x2"], ["Twist crunches", "10x2"], ["Push ups", "20x2"], ["Inclined push ups", "20x2"], ["Hindu push ups", "20x2"], ["Chair assisted dips", "20x2"], ["L-sit", "2 sets"]],
            "Friday": [["Arm + neck rotation", "10x1"], ["Crunches", "15x2"], ["Twist crunches", "10x2"], ["Push ups", "20x2"], ["Inclined push ups", "20x2"], ["Hindu push ups", "20x2"], ["Chair assisted dips", "20x2"], ["L-sit", "2 sets"]],
            "Saturday": [["Arm + neck rotation", "10x1"], ["Bodyweight squats", "10x3"], ["Weighted squats", "10x3"], ["Jumping", "10x3"], ["Running", "30 minutes"]],
            "Sunday": "Rest Day"
        }
    },
    "Gladiator Maximus": {
        "Gym": {
            "Monday": [["Arm + neck rotation", "10x1"], ["Dumbbell bicep curls (10 kgs/22 lbs)", "10x2"], ["Hammer curls (10 kgs/22 lbs)", "10x2"], ["Overhead Triceps extension", "10x2"], ["Preacher curls", "10x2"], ["Overhead press", "10x2"]],
            "Tuesday": [["Arm + neck rotation", "10x1"], ["Dumbbell bicep curls (10 kgs/22 lbs)", "10x2"], ["Hammer curls (10 kgs/22 lbs)", "10x2"], ["Overhead Triceps extension", "10x2"], ["Preacher curls", "10x2"], ["Overhead press", "10x2"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Arm + neck rotation", "10x1"], ["Pull ups", "10x3"], ["Crunches / Ab crunch machine", "10x2"], ["Seated Cable row", "10x2"], ["Cable lats pulldown", "10x2"], ["Pec dec", "10x2"], ["Bench press (20-40 kgs/44-88 lbs)", "2x5"]],
            "Friday": [["Arm + neck rotation", "10x1"], ["Pull ups", "10x3"], ["Crunches / Ab crunch machine", "10x2"], ["Seated Cable row", "10x2"], ["Cable lats pulldown", "10x2"], ["Pec dec", "10x2"], ["Bench press (20-40 kgs/44-88 lbs)", "2x5"]],
            "Saturday": [["Weighted squats", "10x3"], ["Leg press", "10x3"], ["Leg extension", "10x3"], ["Incline leg press", "10x3"], ["Seated leg curl", "10x3"]],
            "Sunday": "Rest Day"
        },
        "Calisthenics": {
            "Monday": [["Arm + neck rotation", "10x1"], ["Push Ups", "20x2"], ["Pull ups", "20x2"], ["Chin ups", "20x2"], ["Frog stand with parallettes", "2 sets"], ["advance tuck front lever hold", "2 sets"], ["Negative front lever raises", "3x1"]],
            "Tuesday": [["Arm + neck rotation", "10x1"], ["Push Ups", "20x2"], ["Pull ups", "20x2"], ["Chin ups", "20x2"], ["Frog stand with parallettes", "2 sets"], ["advance tuck front lever hold", "2 sets"], ["Negative front lever raises", "3x1"]],
            "Wednesday": "Rest Day",
            "Thursday": [["Arm + neck rotation", "10x1"], ["Crunches", "15x2"], ["Twist crunches", "10x2"], ["Push ups", "20x2"], ["Inclined push ups", "20x2"], ["Hindu push ups", "20x2"], ["Chair assisted dips", "20x2"], ["L-sit", "2 sets"]],
            "Friday": [["Arm + neck rotation", "10x1"], ["Crunches", "15x2"], ["Twist crunches", "10x2"], ["Push ups", "20x2"], ["Inclined push ups", "20x2"], ["Hindu push ups", "20x2"], ["Chair assisted dips", "20x2"], ["L-sit", "2 sets"]],
            "Saturday": [["Arm + neck rotation", "10x1"], ["Bodyweight squats", "10x3"], ["Weighted squats", "10x3"], ["Jumping", "10x3"], ["Running", "30 minutes"]],
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

// --- Workout Reminders (view/delete only from the website - adding a new one
// must be done via /remindworkout in Discord, this is enforced by simply
// never exposing a create/update route here) ---
// NOTE: guild_id is stored by the bot as a raw 64-bit int (unlike user_id,
// which is stored as a string). Discord snowflakes exceed what a JS Number
// can represent exactly, so we explicitly disable promoteLongs on these
// queries and convert guild_id to a string ourselves - this is the same
// precision issue migrate_ids_to_strings.js exists to fix, just handled at
// read-time here instead, since the bot's guild_id field was never migrated.
async function getUserReminders(userId) {
    const cursor = remindersDb.collection('workout_reminders').find(
        { user_id: userId },
        { promoteLongs: false }
    );
    const docs = await cursor.toArray();
    return docs.map(r => ({
        guild_id: r.guild_id.toString(),
        guild_name: r.guild_name || 'Unknown Server',
        guild_icon_url: r.guild_icon_url || null,
        channel_name: r.channel_name || 'unknown',
        time_range_text: r.time_range_text || 'Unknown time',
        timezone: r.timezone || 'UTC',
        training_days: r.training_days || [0, 1, 3, 4, 5]
    }));
}

// API Dashboard Route
app.get('/api/dashboard', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;

        const userStats = await db.collection('user_stats').findOne({ _id: userId });

        const userFlexDoc = await db.collection('user_flexes').findOne({ _id: userId });

        const flexesList = userFlexDoc?.flexes || [];
        const activeFlexes = flexesList.filter(f => !f.exercise.includes('(archived)'));
        const archivedFlexes = flexesList.filter(f => f.exercise.includes('(archived)'));

        const customWorkoutDoc = await db.collection('custom_workouts_v2').findOne({ _id: userId });

        const schedules = customWorkoutDoc?.schedules || [];

        const flexCount = userStats?.workout_count ?? 0;
        const rank = calculateRank(flexCount);

        const defaultRoutine = DEFAULT_ROUTINES[rank] || DEFAULT_ROUTINES["Novice / Beginner"];

        let reminders = [];
        try {
            reminders = await getUserReminders(userId);
        } catch (e) {
            console.error('Error fetching reminders:', e);
        }

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
            diet: dietList,
            reminders: reminders
        });

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

// Helper to find custom workout document
async function getCustomWorkoutDoc(userId) {
    return await db.collection('custom_workouts_v2').findOne({ _id: userId });
}

// --- API Endpoints for Custom Workout Schedules & Exercises ---

app.post('/api/workout/schedule/add', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Schedule name is required.' });
        }

        const newSchedule = {
            name: name.trim(),
            days: {
                "Monday": [], "Tuesday": [], "Wednesday": [], "Thursday": [], "Friday": [], "Saturday": [], "Sunday": []
            }
        };

        const userDoc = await getCustomWorkoutDoc(userId);
        const targetId = userDoc ? userDoc._id : userId;

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

app.delete('/api/workout/delete', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;

        await db.collection('custom_workouts_v2').updateOne(
            { _id: userId },
            { $set: { schedules: [] } }
        );

        res.json({ success: true, message: 'All workout schedules deleted successfully.' });
    } catch (error) {
        console.error('Error deleting workouts:', error);
        res.status(500).json({ error: 'Failed to delete workout plans.' });
    }
});

app.post('/api/workout/reset-count', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;

        await db.collection('user_stats').updateOne(
            { _id: userId },
            { $set: { workout_count: 0 } },
            { upsert: true }
        );

        res.json({ success: true, message: 'Workout count has been reset to 0.' });
    } catch (error) {
        console.error('Error resetting workout count:', error);
        res.status(500).json({ error: 'Failed to reset workout count.' });
    }
});

// --- Flex Endpoints ---
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

async function getUserFlexDoc(userId) {
    return await db.collection('user_flexes').findOne({ _id: userId });
}

app.post('/api/flex/add', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
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

        flexes = flexes.map(f => {
            if (normalizeName(f.exercise) === normName && !f.exercise.includes('(archived)')) {
                return { ...f, exercise: `${f.exercise} (archived)` };
            }
            return f;
        });

        const newEntry = {
            exercise: rawName,
            stat: newStat,
            timestamp: fancyDate,
            graph_date: graphLabel,
            raw_ts: nowIso
        };
        flexes.push(newEntry);

        const targetId = userDoc ? userDoc._id : userId;
        await db.collection('user_flexes').updateOne(
            { _id: targetId },
            { $set: { flexes: flexes } },
            { upsert: true }
        );

        // NOTE: workout_count (Total Workouts / rank) is tracked separately by
        // actual logged workouts. Adding a flex (a skill/progress entry) must
        // NOT increment it. That was causing Total Workouts to go up on flex add.

        res.json({ success: true, message: 'Flex logged successfully!', entry: newEntry });
    } catch (error) {
        console.error('Error adding flex:', error);
        res.status(500).json({ error: 'Failed to add flex.' });
    }
});

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
            const isMatch = raw_ts ? (f.exercise === exercise && f.raw_ts === raw_ts) : (f.exercise === exercise);
            if (isMatch) {
                updated = true;
                const isArchived = f.exercise.includes('(archived)');
                let updatedName = newExercise ? newExercise.trim() : f.exercise;
                if (isArchived && !updatedName.includes('(archived)')) {
                    updatedName = `${updatedName} (archived)`;
                }
                return { ...f, exercise: updatedName, stat: newStat ? newStat.trim() : f.stat };
            }
            return f;
        });

        if (!updated) return res.status(404).json({ error: 'Target flex not found.' });

        await db.collection('user_flexes').updateOne({ _id: userDoc._id }, { $set: { flexes: updatedFlexes } });
        res.json({ success: true, message: 'Flex updated successfully.' });
    } catch (error) {
        console.error('Error editing flex:', error);
        res.status(500).json({ error: 'Failed to edit flex.' });
    }
});

app.post('/api/flex/archive', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { exercise, raw_ts } = req.body;
        const userDoc = await getUserFlexDoc(userId);
        if (!userDoc || !userDoc.flexes) return res.status(404).json({ error: 'No flex records found.' });

        let updated = false;
        const updatedFlexes = userDoc.flexes.map(f => {
            const isMatch = raw_ts ? (f.exercise === exercise && f.raw_ts === raw_ts) : (f.exercise === exercise);
            if (isMatch) {
                updated = true;
                if (!f.exercise.includes('(archived)')) return { ...f, exercise: `${f.exercise} (archived)` };
            }
            return f;
        });

        if (!updated) return res.status(404).json({ error: 'Flex entry not found.' });
        await db.collection('user_flexes').updateOne({ _id: userDoc._id }, { $set: { flexes: updatedFlexes } });
        res.json({ success: true, message: 'Flex archived successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to archive flex.' });
    }
});

app.post('/api/flex/unarchive', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { exercise, raw_ts } = req.body;
        const userDoc = await getUserFlexDoc(userId);
        if (!userDoc || !userDoc.flexes) return res.status(404).json({ error: 'No flex records found.' });

        const cleanTargetName = exercise.replace('(archived)', '').trim();
        const targetNorm = normalizeName(cleanTargetName);

        let flexes = userDoc.flexes.map(f => {
            if (normalizeName(f.exercise) === targetNorm && !f.exercise.includes('(archived)')) {
                return { ...f, exercise: `${f.exercise} (archived)` };
            }
            return f;
        });

        let updated = false;
        flexes = flexes.map(f => {
            const isMatch = raw_ts ? (f.exercise === exercise && f.raw_ts === raw_ts) : (f.exercise === exercise);
            if (isMatch) {
                updated = true;
                return { ...f, exercise: cleanTargetName };
            }
            return f;
        });

        if (!updated) return res.status(404).json({ error: 'Flex entry not found.' });
        await db.collection('user_flexes').updateOne({ _id: userDoc._id }, { $set: { flexes: flexes } });
        res.json({ success: true, message: 'Flex unarchived successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to unarchive flex.' });
    }
});

app.delete('/api/flex/delete', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const exercise = req.body.exercise || req.body.targetItem?.exercise;
        const userDoc = await getUserFlexDoc(userId);
        if (!userDoc || !userDoc.flexes) return res.status(404).json({ error: 'No flex records found.' });

        const cleanTargetName = exercise.replace('(archived)', '').trim();
        const targetNorm = normalizeName(cleanTargetName);

        const initialLength = userDoc.flexes.length;
        // Cascade delete: remove every entry (active AND archived) sharing this
        // exercise name, so deleting "Lift" also clears out its archived history
        // instead of leaving orphaned duplicates behind.
        const updatedFlexes = userDoc.flexes.filter(f => {
            const cleanName = f.exercise.replace('(archived)', '').trim();
            return normalizeName(cleanName) !== targetNorm;
        });

        if (updatedFlexes.length === initialLength) return res.status(404).json({ error: 'Flex entry not found.' });
        await db.collection('user_flexes').updateOne({ _id: userDoc._id }, { $set: { flexes: updatedFlexes } });
        res.json({ success: true, message: 'Flex deleted successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete flex.' });
    }
});

app.delete('/api/flex/clear-all', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userDoc = await getUserFlexDoc(userId);
        if (userDoc) {
            await db.collection('user_flexes').updateOne({ _id: userDoc._id }, { $set: { flexes: [] } });
        }
        res.json({ success: true, message: 'All flexes cleared.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear flexes.' });
    }
});

// Deletes one server's reminder. There is deliberately no corresponding
// POST/create route here - adding a reminder can only be done via
// /remindworkout in a Discord server channel.
app.delete('/api/reminders', checkAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const guildIdStr = req.body.guild_id;
        if (!guildIdStr) {
            return res.status(400).json({ error: 'guild_id is required.' });
        }

        const guildIdLong = Long.fromString(String(guildIdStr));
        const result = await remindersDb.collection('workout_reminders').deleteOne({
            user_id: userId,
            guild_id: guildIdLong
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Reminder not found.' });
        }
        res.json({ success: true, message: 'Reminder deleted successfully.' });
    } catch (error) {
        console.error('Error deleting reminder:', error);
        res.status(500).json({ error: 'Failed to delete reminder.' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Gladiator Dashboard running on http://localhost:${PORT}`);
});