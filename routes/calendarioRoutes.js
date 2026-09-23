const express = require('express');
const router = express.Router();
const {
  obtenerEventos,
  crearEvento,
  actualizarEvento,
  toggleCompletado,
  eliminarEvento,
  obtenerProximosEventos,
  obtenerEstadisticas,
  obtenerAnios
} = require('../controllers/calendarioController');

router.get('/', obtenerEventos);
router.get('/proximos', obtenerProximosEventos);
router.get('/estadisticas', obtenerEstadisticas);
router.get('/anios', obtenerAnios);
router.post('/', crearEvento);
router.put('/:id', actualizarEvento);
router.patch('/:id/toggle', toggleCompletado);
router.delete('/:id', eliminarEvento);

module.exports = router;