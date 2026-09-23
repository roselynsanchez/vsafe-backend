const express = require('express');
const router = express.Router();
const { 
  registrarMovimiento, 
  obtenerMovimientos, 
  obtenerProximaRequisicion 
} = require('../controllers/trazabilidadController');
const { enviarCorreoPrueba } = require('../services/emailService');
const PDFDocument = require('pdfkit');
const pool = require('../config/db');
const path = require('path');
const fs = require('fs');

// ============ RUTAS DE MOVIMIENTOS ============
router.post('/', registrarMovimiento);
router.post('/movimiento', registrarMovimiento);
router.get('/movimientos', obtenerMovimientos);
router.get('/proxima-requisicion', obtenerProximaRequisicion);

// ============ RUTA DE PRUEBA DE CORREO ============
router.post('/test-email', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Falta el email de destino' });
  }

  const resultado = await enviarCorreoPrueba(email);

  if (resultado.ok) {
    res.json({ 
      mensaje: '✅ Correo de prueba enviado correctamente',
      messageId: resultado.messageId 
    });
  } else {
    res.status(500).json({ 
      error: '❌ No se pudo enviar el correo',
      detalle: resultado.error 
    });
  }
});

// ============ CERTIFICADO PDF POR VEHÍCULO ============
router.get('/certificado/:id_vehiculo', async (req, res) => {
  const { id_vehiculo } = req.params;

  try {
    const [filas] = await pool.query(
      `SELECT v.vin_chasis, v.marca_modelo, v.cliente, m.nombre AS material, 
              m.nivel_balistico, t.cantidad_usada, 
              t.fecha_aplicacion AS fecha_registro, t.operario_responsable
       FROM trazabilidad_material t
       JOIN vehiculos v ON t.id_vehiculo = v.id_vehiculo
       JOIN materiales m ON t.id_material = m.id_material
       WHERE t.id_vehiculo = ?`, 
      [id_vehiculo]
    );

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Certificado_VSAFE_${id_vehiculo}.pdf`);

    doc.pipe(res);

    const rutaLogo = path.join(__dirname, '../logo_vsafe.png');
    const existeLogo = fs.existsSync(rutaLogo);

    if (existeLogo) {
      doc.save();
      doc.opacity(0.08);
      doc.image(rutaLogo, 150, 250, { width: 300 });
      doc.restore();
      doc.image(rutaLogo, 50, 45, { width: 70 });
    }

    doc.fillColor('#0f172a').fontSize(18).font('Helvetica-Bold').text('VSAFE BLINDAJES S.A.', existeLogo ? 130 : 50, 45);
    doc.fillColor('#475569').fontSize(10).font('Helvetica').text('Sistema de Gestión y Trazabilidad de Materiales Balísticos', existeLogo ? 130 : 50, 68);
    doc.moveTo(50, 105).lineTo(550, 105).strokeColor('#1e3a8a').lineWidth(2).stroke();

    doc.moveDown(2.5);
    doc.fillColor('#1e3a8a').fontSize(14).font('Helvetica-Bold').text('CERTIFICADO OFICIAL DE TRAZABILIDAD BALÍSTICA', { align: 'center' });
    doc.moveDown(0.5);
    doc.fillColor('#64748b').fontSize(9).font('Helvetica').text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-ES')}`, { align: 'center' });

    if (filas.length > 0) {
      doc.rect(50, 175, 500, 75).fillAndStroke('#f8fafc', '#cbd5e1');
      doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text('INFORMACIÓN DEL VEHÍCULO Y CLIENTE', 65, 185);
      doc.fontSize(10).font('Helvetica').fillColor('#334155');
      doc.text(`Cliente: ${filas[0].cliente}`, 65, 205);
      doc.text(`Modelo: ${filas[0].marca_modelo}`, 65, 220);
      doc.text(`VIN / Chasis: ${filas[0].vin_chasis}`, 300, 205);

      doc.moveDown(4);
      doc.fillColor('#1e3a8a').fontSize(11).font('Helvetica-Bold').text('MATERIALES BALÍSTICOS INSTALADOS EN ENSAMBLE:');

      let y = doc.y + 10;
      doc.rect(50, y, 500, 20).fill('#1e3a8a');
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
      doc.text('Material Balístico', 60, y + 5);
      doc.text('Nivel', 250, y + 5);
      doc.text('Cantidad', 340, y + 5);
      doc.text('Técnico Responsable', 420, y + 5);

      y += 20;
      doc.font('Helvetica').fontSize(9);

      filas.forEach((f, i) => {
        const bgColor = i % 2 === 0 ? '#ffffff' : '#f1f5f9';
        doc.rect(50, y, 500, 20).fill(bgColor);
        doc.fillColor('#0f172a');
        doc.text(f.material, 60, y + 5, { width: 180 });
        doc.text(f.nivel_balistico, 250, y + 5);
        doc.text(`${f.cantidad_usada}`, 340, y + 5);
        doc.text(f.operario_responsable, 420, y + 5);
        y += 20;
      });

      const firmaY = y + 40;
      doc.moveTo(200, firmaY).lineTo(400, firmaY).strokeColor('#94a3b8').lineWidth(1).stroke();
      doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text('DEPARTAMENTO DE CONTROL DE CALIDAD', 50, firmaY + 10, { align: 'center' });
      doc.fillColor('#64748b').fontSize(9).font('Helvetica').text('VSAFE BLINDAJES S.A. - Garantía Balística', 50, firmaY + 25, { align: 'center' });
    } else {
      doc.fillColor('#dc2626').fontSize(11).text('No se encontraron registros de materiales balísticos asignados a este vehículo.', 50, 200);
    }

    doc.end();
  } catch (error) {
    console.error('Error al generar PDF:', error.message);
    res.status(500).json({ error: 'Error al generar el certificado PDF' });
  }
});

module.exports = router;