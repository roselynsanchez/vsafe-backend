const express = require('express');
const router = express.Router();
const { 
  obtenerMateriales, 
  obtenerCategorias,
  crearMaterial, 
  actualizarMaterial,
  eliminarMaterial 
} = require('../controllers/materialesController');

router.get('/', obtenerMateriales);
router.get('/categorias', obtenerCategorias);
router.post('/', crearMaterial);
router.put('/:id', actualizarMaterial);
router.delete('/:id', eliminarMaterial);

module.exports = router;