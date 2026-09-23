const express = require('express');
const router = express.Router();
const multer = require('multer');
const { cargarExcel } = require('../controllers/excelController');

// Configuración para guardar temporalmente el Excel
const upload = multer({ dest: 'uploads/' });

// Ruta POST: /api/excel/cargar
router.post('/cargar', upload.single('archivoExcel'), cargarExcel);

module.exports = router;