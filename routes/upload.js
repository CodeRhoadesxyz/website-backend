const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Store uploads on the same persistent volume as the SQLite database (see
// DATABASE_PATH in README) — NOT the app's own code directory, which is
// wiped and replaced on every deploy. Defaults alongside the DB file.
const uploadsDir = process.env.UPLOADS_PATH || './data/uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, uniqueName);
  },
});

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, WEBP, and GIF images are allowed.'));
    }
    cb(null, true);
  },
});

// --- Admin: upload a single image, get back a URL to use in any image_url field ---
router.post('/', requireAdmin, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No image file was provided.' });
    }
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });
});

// --- Public: upload a single image with no admin session required.
// Used by public-facing widgets (e.g. the testimonials "share your story"
// form) so a visitor can attach their own photo instead of only being able
// to paste an existing image URL. Same file-type/size limits as the admin
// upload above — this does not grant any additional access, it just skips
// the requireAdmin check for this one endpoint.
router.post('/public', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No image file was provided.' });
    }
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });
});

module.exports = { router, uploadsDir };
