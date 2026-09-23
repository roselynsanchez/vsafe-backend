const express = require('express');
const router = express.Router();
const { 
  obtenerCompras, 
  obtenerComprasPorProveedor,
  crearCompra, 
  actualizarCompra, 
  eliminarCompra,
  obtenerEstadisticas,
  generarFacturaPDF,
  crearCompraDesdeIA
} = require('../controllers/comprasController');

router.get('/', obtenerCompras);
router.get('/estadisticas', obtenerEstadisticas);
router.get('/proveedor/:id', obtenerComprasPorProveedor);
router.post('/desde-ia', crearCompraDesdeIA);
router.post('/', crearCompra);
router.get('/:id/factura', generarFacturaPDF);
router.put('/:id', actualizarCompra);
router.delete('/:id', eliminarCompra);

module.exports = router;