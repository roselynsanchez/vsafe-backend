const nodemailer = require('nodemailer');
require('dotenv').config();

// ============ CONFIGURACIÓN DEL TRANSPORTE ============
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Error configurando correo:', error.message);
  } else {
    console.log('✅ Servidor de correo listo para enviar');
  }
});

// ============ ENVIAR ALERTA DE STOCK BAJO (MULTI-DESTINATARIO) ============
const enviarAlertaStockBajo = async ({ 
  material, 
  stockActual, 
  stockMinimo, 
  unidad, 
  destinatarios
}) => {
  
  let listaDestinatarios = [];
  
  if (Array.isArray(destinatarios)) {
    listaDestinatarios = destinatarios.filter(e => e && e.trim() !== '');
  } else if (typeof destinatarios === 'string' && destinatarios.trim() !== '') {
    listaDestinatarios = destinatarios
      .split(/[,;]/)
      .map(e => e.trim())
      .filter(e => e !== '');
  }
  
  if (listaDestinatarios.length === 0) {
    const general = process.env.EMAIL_ALERTAS_DESTINO;
    if (general) {
      listaDestinatarios = general.split(/[,;]/).map(e => e.trim()).filter(e => e);
    }
  }
  
  if (listaDestinatarios.length === 0) {
    console.warn('⚠️ No hay destinatarios configurados');
    return { ok: false, error: 'Sin destinatarios' };
  }

  const destinatarioFinal = listaDestinatarios.join(', ');
  console.log('📧 Enviando alerta a:', destinatarioFinal);

  const colorAlerta = stockActual <= (stockMinimo / 2) ? '#dc2626' : '#f59e0b';
  const nivelTexto = stockActual <= (stockMinimo / 2) ? 'CRÍTICO' : 'ADVERTENCIA';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; padding: 20px; margin: 0; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; font-weight: 900; }
        .header p { margin: 6px 0 0; font-size: 12px; opacity: 0.8; }
        .body { padding: 30px; }
        .alerta-badge { display: inline-block; background: ${colorAlerta}; color: white; padding: 6px 16px; border-radius: 20px; font-weight: bold; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
        .material-name { font-size: 20px; font-weight: bold; color: #0f172a; margin: 15px 0 5px; }
        .stock-box { background: #f8fafc; border-left: 4px solid ${colorAlerta}; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .stock-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
        .stock-row:last-child { border-bottom: none; }
        .stock-row .label { color: #64748b; font-size: 13px; }
        .stock-row .value { color: #0f172a; font-weight: bold; font-size: 15px; }
        .stock-actual { color: ${colorAlerta} !important; font-size: 24px !important; }
        .recomendacion { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 15px; margin-top: 20px; }
        .recomendacion h3 { margin: 0 0 8px; color: #1e40af; font-size: 14px; }
        .recomendacion p { margin: 0; color: #1e3a8a; font-size: 13px; line-height: 1.5; }
        .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⚠️ Alerta de Stock Bajo</h1>
          <p>Sistema VSAFE - Gestión de Inventario</p>
        </div>
        <div class="body">
          <span class="alerta-badge">${nivelTexto}</span>
          <div class="material-name">${material}</div>
          <div class="stock-box">
            <div class="stock-row">
              <span class="label">Stock Actual:</span>
              <span class="value stock-actual">${stockActual} ${unidad || ''}</span>
            </div>
            <div class="stock-row">
              <span class="label">Stock Mínimo:</span>
              <span class="value">${stockMinimo} ${unidad || ''}</span>
            </div>
            <div class="stock-row">
              <span class="label">Faltante para el mínimo:</span>
              <span class="value">${Math.max(0, stockMinimo - stockActual).toFixed(2)} ${unidad || ''}</span>
            </div>
          </div>
          <div class="recomendacion">
            <h3>📋 Acción recomendada</h3>
            <p>
              El material <strong>${material}</strong> ha alcanzado un nivel de stock bajo el mínimo configurado. 
              Se recomienda generar una <strong>orden de compra</strong> a la brevedad para evitar 
              el desabastecimiento de la producción.
            </p>
          </div>
          <p style="color: #64748b; font-size: 12px; margin-top: 20px;">
            Mensaje automático del Sistema VSAFE. Por favor no responder.
          </p>
        </div>
        <div class="footer">
          © ${new Date().getFullYear()} VSAFE BLINDAJES S.A. — Todos los derechos reservados
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"Alertas VSAFE" <no-reply@vsafe.com>',
      to: destinatarioFinal,
      subject: `⚠️ Alerta de Stock Bajo: ${material} (${stockActual} ${unidad || 'unidades'})`,
      html
    });

    console.log(`✅ Correo enviado a ${listaDestinatarios.length} destinatario(s): ${info.messageId}`);
    return { 
      ok: true, 
      messageId: info.messageId,
      destinatarios: listaDestinatarios
    };

  } catch (error) {
    console.error('❌ Error enviando correo:', error.message);
    return { ok: false, error: error.message };
  }
};

// ============ ENVIAR CORREO DE PRUEBA ============
const enviarCorreoPrueba = async (destinatario) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"Alertas VSAFE" <no-reply@vsafe.com>',
      to: destinatario,
      subject: '✅ Prueba de correo — Sistema VSAFE',
      html: `
        <div style="font-family: Arial; max-width: 600px; margin: 0 auto; padding: 30px; background: #f8fafc; border-radius: 12px;">
          <h1 style="color: #1e3a8a;">✅ ¡Correo funcionando!</h1>
          <p style="color: #64748b; font-size: 14px;">
            Este es un correo de prueba del Sistema VSAFE.
          </p>
          <p style="color: #64748b; font-size: 12px; margin-top: 20px;">
            Fecha: ${new Date().toLocaleString('es-ES')}
          </p>
        </div>
      `
    });

    return { ok: true, messageId: info.messageId };

  } catch (error) {
    return { ok: false, error: error.message };
  }
};

module.exports = {
  enviarAlertaStockBajo,
  enviarCorreoPrueba
};
