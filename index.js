const express = require('express');
const cors = require('cors');
require('dotenv').config();

require('./config/db');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/authRoutes'));           // NUEVO
app.use('/api/materiales', require('./routes/materialesRoutes'));
app.use('/api/trazabilidad', require('./routes/trazabilidadRoutes'));
app.use('/api/excel', require('./routes/excelRoutes'));
app.use('/api/clientes', require('./routes/clientesRoutes'));
app.use('/api/vehiculos', require('./routes/vehiculosRoutes'));
app.use('/api/proveedores', require('./routes/proveedoresRoutes'));
app.use('/api/compras', require('./routes/comprasRoutes'));
app.use('/api/calendario', require('./routes/calendarioRoutes'));
app.use('/api/categorias', require('./routes/categoriasRoutes'));

app.get('/', (req, res) => {
  res.json({ mensaje: 'API REST VSAFE funcionando' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend VSAFE ejecutándose en el puerto ${PORT}`);
});