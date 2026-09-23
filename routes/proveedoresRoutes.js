const express = require('express');
const router = express.Router();
const { 
  obtenerProveedores, 
  crearProveedor, 
  actualizarProveedor, 
  eliminarProveedor,
  toggleActivo
} = require('../controllers/proveedoresController');

router.get('/', obtenerProveedores);
router.post('/', crearProveedor);
router.put('/:id', actualizarProveedor);
router.delete('/:id', eliminarProveedor);
router.patch('/:id/toggle', toggleActivo);

module.exports = router;