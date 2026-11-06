/* Control de gastos Ju — lógica de la app (sin dependencias). */
(() => {
  'use strict';

  // ============================================================
  // Constantes y datos iniciales
  // ============================================================
  const STORAGE_KEY = 'gastosJu.datos.v1';
  const VERSION_DATOS = 1;

  const CATEGORIAS = { consumo: 'Consumo', reserva: 'Reserva/Ahorro' };

  const CONCEPTOS_INICIALES = [
    ['Alquiler', 'consumo'], ['Luz', 'consumo'], ['Servicios sociales', 'consumo'],
    ['Gas', 'consumo'], ['Endeza (agua)', 'consumo'], ['Servicios generales', 'consumo'],
    ['Tuenti', 'consumo'], ['Escuela de arte', 'consumo'], ['Tienda Sucuchito', 'consumo'],
    ['ChatGPT', 'consumo'], ['Claude', 'consumo'], ['ARQ', 'consumo'],
    ['Reserva vacaciones', 'reserva'], ['Reserva mensual', 'reserva']
  ];
  const MEDIOS_INICIALES = ['Francés', 'ARQ', 'Mercado Pago', 'Cuenta DNI'];

  const TITULOS = { mes: 'Este mes', resumen: 'Resumen', historial: 'Historial', config: 'Configuración' };

  const ICON = {
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    alerta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v6M12 17h.01"/></svg>',
    arriba: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
    abajo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    cerrar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>'
  };

  // ============================================================
  // Utilidades
  // ============================================================
  const $ = (sel, root = document) => root.querySelector(sel);

  const uid = () => {
    try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* sin contexto seguro */ }
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  };

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const fmtMoneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (n) => fmtMoneda.format(Number(n) || 0);

  // Número para un campo editable: "12.345,67" o "12.345"
  const montoParaInput = (n) => {
    if (n == null || n === '' || isNaN(n)) return '';
    const entero = Math.round(n * 100) % 100 === 0;
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: entero ? 0 : 2, maximumFractionDigits: 2 }).format(n);
  };

  // Acepta "12.345,67", "12345,67", "12345.67", "$ 12.345". Devuelve null si está vacío y NaN si es inválido.
  const parseMonto = (str) => {
    let s = String(str == null ? '' : str).replace(/[\s$ ]/g, '');
    if (!s) return null;
    if (s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
    if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  };

  const pad2 = (n) => String(n).padStart(2, '0');
  const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const mesActual = () => hoyISO().slice(0, 7);
  const sumarMeses = (clave, n) => {
    const [y, m] = clave.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  };
  const nombreMes = (clave) => {
    const [y, m] = clave.split('-').map(Number);
    const s = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1) + ' ' + y;
  };
  const diasDelMes = (clave) => { const [y, m] = clave.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
  const fechaLarga = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

  const esMes = (k) => /^\d{4}-\d{2}$/.test(k);
  const esFecha = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k);

  // ============================================================
  // Estado y almacenamiento
  // ============================================================
  let guardadoOk = true;
  let avisoInicial = null;

  function estadoInicial() {
    return {
      version: VERSION_DATOS,
      conceptos: CONCEPTOS_INICIALES.map(([nombre, categoria], i) => ({
        id: uid(), nombre, categoria,
        montoEstimado: null, vencimientoDia: null, medioSugeridoId: null, alias: '',
        activo: true, orden: i
      })),
      medios: MEDIOS_INICIALES.map((nombre) => ({ id: uid(), nombre })),
      meses: {}
    };
  }

  function esEstadoValido(d) {
    return !!d && typeof d === 'object' && Array.isArray(d.conceptos) && Array.isArray(d.medios) &&
      !!d.meses && typeof d.meses === 'object' && !Array.isArray(d.meses);
  }

  const numOrNull = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));
  const diaOrNull = (v) => { const n = numOrNull(v); return n && n >= 1 && n <= 31 ? Math.round(n) : null; };

  // Completa campos faltantes (sirve para respaldos viejos o editados a mano).
  function normalizar(d) {
    const medios = d.medios
      .filter((m) => m && typeof m.nombre === 'string' && m.nombre.trim())
      .map((m) => ({ id: String(m.id || uid()), nombre: m.nombre.trim() }));
    const conceptos = d.conceptos
      .filter((c) => c && typeof c.nombre === 'string' && c.nombre.trim())
      .map((c, i) => ({
        id: String(c.id || uid()),
        nombre: c.nombre.trim(),
        categoria: c.categoria === 'reserva' ? 'reserva' : 'consumo',
        montoEstimado: numOrNull(c.montoEstimado),
        vencimientoDia: diaOrNull(c.vencimientoDia),
        medioSugeridoId: c.medioSugeridoId ? String(c.medioSugeridoId) : null,
        alias: typeof c.alias === 'string' ? c.alias.trim() : '',
        activo: c.activo !== false,
        orden: Number.isFinite(Number(c.orden)) ? Number(c.orden) : i
      }));
    const meses = {};
    Object.keys(d.meses).filter(esMes).forEach((k) => {
      const m = d.meses[k];
      const pagos = (m && Array.isArray(m.pagos) ? m.pagos : []).filter((p) => p && p.nombre).map((p, i) => ({
        id: String(p.id || uid()),
        conceptoId: p.conceptoId ? String(p.conceptoId) : null,
        nombre: String(p.nombre),
        categoria: p.categoria === 'reserva' ? 'reserva' : 'consumo',
        montoEstimado: numOrNull(p.montoEstimado),
        vencimientoDia: diaOrNull(p.vencimientoDia),
        medioSugeridoId: p.medioSugeridoId ? String(p.medioSugeridoId) : null,
        alias: typeof p.alias === 'string' ? p.alias : '',
        orden: Number.isFinite(Number(p.orden)) ? Number(p.orden) : i,
        estado: p.estado === 'pagado' ? 'pagado' : 'pendiente',
        montoPagado: numOrNull(p.montoPagado),
        medioUsadoId: p.medioUsadoId ? String(p.medioUsadoId) : null,
        medioUsadoNombre: p.medioUsadoNombre ? String(p.medioUsadoNombre) : null,
        fechaPago: esFecha(p.fechaPago) ? p.fechaPago : null,
        nota: typeof p.nota === 'string' ? p.nota : ''
      }));
      meses[k] = { pagos };
    });
    return { version: VERSION_DATOS, conceptos, medios, meses };
  }

  function cargar() {
    let crudo = null;
    try {
      crudo = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      guardadoOk = false;
      return estadoInicial();
    }
    if (!crudo) return null; // primera vez
    try {
      const d = JSON.parse(crudo);
      if (esEstadoValido(d)) return normalizar(d);
    } catch (e) { /* datos dañados */ }
    // No se pierde nada: se guarda una copia de lo que había antes de empezar de nuevo.
    try { localStorage.setItem(`${STORAGE_KEY}.danado.${Date.now()}`, crudo); } catch (e) { /* sin espacio */ }
    avisoInicial = 'Los datos guardados estaban dañados. Se guardó una copia y se empezó de nuevo.';
    return estadoInicial();
  }

  function guardar() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      guardadoOk = true;
    } catch (e) {
      guardadoOk = false;
    }
    $('#storageBanner').hidden = guardadoOk;
    return guardadoOk;
  }

  let state = cargar();
  const esPrimeraVez = state === null;
  if (esPrimeraVez) state = estadoInicial();

  const ui = { tab: 'mes', mes: mesActual(), ultimoMesVisto: mesActual() };
  try {
    const t = sessionStorage.getItem('gastosJu.tab');
    if (t && TITULOS[t]) ui.tab = t;
  } catch (e) { /* no importa */ }

  // ============================================================
  // Lógica de datos
  // ============================================================
  const conceptosOrdenados = () => state.conceptos.slice().sort((a, b) => a.orden - b.orden);
  const conceptoPorId = (id) => state.conceptos.find((c) => c.id === id);
  const medioPorId = (id) => state.medios.find((m) => m.id === id);
  const nombreMedio = (id, respaldo) => { const m = id && medioPorId(id); return m ? m.nombre : (respaldo || ''); };

  function pagoDesdeConcepto(c) {
    return {
      id: uid(), conceptoId: c.id, nombre: c.nombre, categoria: c.categoria,
      montoEstimado: c.montoEstimado, vencimientoDia: c.vencimientoDia,
      medioSugeridoId: c.medioSugeridoId, alias: c.alias, orden: c.orden,
      estado: 'pendiente', montoPagado: null, medioUsadoId: null, medioUsadoNombre: null,
      fechaPago: null, nota: ''
    };
  }

  // Crea los pagos de un mes a partir de los conceptos activos.
  // Los meses pasados sin datos solo se crean si se pide explícitamente.
  function asegurarMes(clave, forzar = false) {
    if (state.meses[clave]) return true;
    if (clave < mesActual() && !forzar) return false;
    state.meses[clave] = { pagos: conceptosOrdenados().filter((c) => c.activo).map(pagoDesdeConcepto) };
    guardar();
    return true;
  }

  // Después de editar conceptos: actualiza solo los pagos PENDIENTES del mes actual en adelante.
  // Los pagos ya hechos y los meses anteriores no se tocan.
  function sincronizarConceptos() {
    const actual = mesActual();
    Object.keys(state.meses).forEach((clave) => {
      if (clave < actual) return;
      const mes = state.meses[clave];
      mes.pagos = mes.pagos.filter((p) => {
        if (p.estado === 'pagado') return true;
        const c = conceptoPorId(p.conceptoId);
        return c && c.activo;
      });
      mes.pagos.forEach((p) => {
        if (p.estado === 'pagado') return;
        const c = conceptoPorId(p.conceptoId);
        Object.assign(p, {
          nombre: c.nombre, categoria: c.categoria, montoEstimado: c.montoEstimado,
          vencimientoDia: c.vencimientoDia, medioSugeridoId: c.medioSugeridoId, alias: c.alias, orden: c.orden
        });
      });
      conceptosOrdenados().forEach((c) => {
        if (c.activo && !mes.pagos.some((p) => p.conceptoId === c.id)) mes.pagos.push(pagoDesdeConcepto(c));
      });
    });
  }

  function fechaVencimiento(p, clave) {
    if (!p.vencimientoDia) return null;
    return `${clave}-${pad2(Math.min(p.vencimientoDia, diasDelMes(clave)))}`;
  }

  function estadoDe(p, clave) {
    if (p.estado === 'pagado') return 'pagado';
    const v = fechaVencimiento(p, clave);
    if (!v) return 'pendiente';
    const hoy = hoyISO();
    if (v < hoy) return 'vencido';
    if (v === hoy) return 'hoy';
    return 'pendiente';
  }

  function ordenarPagos(pagos, clave) {
    const dia = (p) => (p.vencimientoDia ? Math.min(p.vencimientoDia, diasDelMes(clave)) : 99);
    return pagos.slice().sort((a, b) =>
      (a.estado === 'pagado') - (b.estado === 'pagado') ||
      dia(a) - dia(b) || a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'));
  }

  function totales(clave) {
    const pagos = (state.meses[clave] && state.meses[clave].pagos) || [];
    const t = {
      cantidad: pagos.length, pagados: 0, pagado: 0, pendiente: 0, estimado: 0,
      cat: { consumo: { pagado: 0, pendiente: 0, estimado: 0, n: 0, np: 0 }, reserva: { pagado: 0, pendiente: 0, estimado: 0, n: 0, np: 0 } },
      porMedio: {}
    };
    pagos.forEach((p) => {
      const est = p.montoEstimado || 0;
      const c = t.cat[p.categoria] || t.cat.consumo;
      t.estimado += est; c.estimado += est; c.n += 1;
      if (p.estado === 'pagado') {
        const m = p.montoPagado || 0;
        t.pagados += 1; t.pagado += m; c.pagado += m; c.np += 1;
        const nombre = nombreMedio(p.medioUsadoId, p.medioUsadoNombre) || 'Sin medio';
        t.porMedio[nombre] = (t.porMedio[nombre] || 0) + m;
      } else {
        t.pendiente += est; c.pendiente += est;
      }
    });
    return t;
  }

  // ============================================================
  // Avisos y confirmaciones
  // ============================================================
  let toastTimer = null;
  function toast(msg, accion) {
    const el = $('#toast');
    const btn = $('#toastAction');
    $('#toastMsg').textContent = msg;
    if (accion) {
      btn.textContent = accion.texto;
      btn.hidden = false;
      btn.onclick = () => { ocultarToast(); accion.fn(); };
    } else {
      btn.hidden = true;
      btn.onclick = null;
    }
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(ocultarToast, accion ? 5000 : 2500);
  }
  function ocultarToast() { $('#toast').hidden = true; }

  function confirmar({ titulo, mensaje, ok = 'Aceptar', peligro = false }) {
    return new Promise((resolve) => {
      const d = $('#confirm');
      $('#confirmTitle').textContent = titulo;
      $('#confirmMsg').textContent = mensaje || '';
      const btnOk = $('#confirmOk');
      btnOk.textContent = ok;
      btnOk.className = 'btn ' + (peligro ? 'btn-danger' : 'btn-primary');
      d.returnValue = '';
      d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true });
      d.showModal();
      $('#confirmCancel').focus();
    });
  }

  async function copiar(texto) {
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(texto);
        ok = true;
      }
    } catch (e) { ok = false; }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = texto;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch (e) { ok = false; }
    }
    toast(ok ? 'Alias copiado' : 'No se pudo copiar. Mantené apretado el alias para copiarlo.');
  }

  // ============================================================
  // Render general
  // ============================================================
  const main = $('#main');

  function render() {
    document.querySelectorAll('.tabbar button').forEach((b) => {
      if (b.dataset.tab === ui.tab) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    $('#titulo').textContent = TITULOS[ui.tab];
    const conMes = ui.tab === 'mes' || ui.tab === 'resumen';
    $('#monthNav').hidden = !conMes;
    $('#mesLabel').textContent = nombreMes(ui.mes);
    $('#irHoy').hidden = ui.mes === mesActual();

    if (ui.tab === 'mes') main.innerHTML = vistaMes();
    else if (ui.tab === 'resumen') main.innerHTML = vistaResumen();
    else if (ui.tab === 'historial') main.innerHTML = vistaHistorial();
    else main.innerHTML = vistaConfig();
  }

  function irATab(tab) {
    ui.tab = tab;
    ocultarToast();
    try { sessionStorage.setItem('gastosJu.tab', tab); } catch (e) { /* no importa */ }
    render();
    window.scrollTo(0, 0);
  }

  // ---------- Mes actual ----------
  function vistaMes() {
    const clave = ui.mes;
    if (!asegurarMes(clave)) {
      return `<div class="card empty-state">
        <p>No hay pagos cargados para ${esc(nombreMes(clave))}.</p>
        <button type="button" class="btn btn-primary" data-action="generar-mes">Generar pagos de este mes</button>
      </div>`;
    }
    const pagos = ordenarPagos(state.meses[clave].pagos, clave);
    if (!pagos.length) {
      return `<div class="card empty-state">
        <p>No hay conceptos activos para este mes.</p>
        <button type="button" class="btn btn-primary" data-action="ir-config">Ir a Configuración</button>
      </div>`;
    }
    const t = totales(clave);
    const pct = t.cantidad ? Math.round((t.pagados / t.cantidad) * 100) : 0;
    const pendientes = pagos.filter((p) => p.estado !== 'pagado');
    const pagados = pagos.filter((p) => p.estado === 'pagado');

    let html = `<section class="card" aria-label="Progreso del mes">
      <div class="progress-head">
        <strong>${t.pagados} de ${t.cantidad} pagados</strong>
        <span class="pend">Pendiente <b>${money(t.pendiente)}</b></span>
      </div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${t.cantidad}" aria-valuenow="${t.pagados}" aria-label="Pagos hechos"><span style="width:${pct}%"></span></div>
    </section>`;

    if (pendientes.length) {
      html += `<h2 class="section-title">Pendientes (${pendientes.length})</h2><ul class="list">${pendientes.map((p) => filaPago(p, clave)).join('')}</ul>`;
    } else {
      html += `<div class="card empty-state" style="margin-top:16px"><p style="margin:0">¡Todo pagado este mes! 🎉</p></div>`;
    }
    if (pagados.length) {
      html += `<h2 class="section-title">Pagados (${pagados.length})</h2><ul class="list">${pagados.map((p) => filaPago(p, clave)).join('')}</ul>`;
    }
    return html;
  }

  function filaPago(p, clave) {
    const est = estadoDe(p, clave);
    const venc = fechaVencimiento(p, clave);
    const meta = [];
    let monto;

    if (est === 'pagado') {
      monto = `<span class="row-amount">${money(p.montoPagado)}</span>`;
      meta.push(`<span class="badge ok">Pagado ${esc(ddmm(p.fechaPago))}</span>`);
      const medio = nombreMedio(p.medioUsadoId, p.medioUsadoNombre);
      if (medio) meta.push(`<span>${esc(medio)}</span>`);
    } else {
      monto = p.montoEstimado != null
        ? `<span class="row-amount">${money(p.montoEstimado)}</span>`
        : '<span class="row-amount empty">Sin monto</span>';
      if (est === 'vencido') meta.push(`<span class="badge danger">Venció ${esc(ddmm(venc))}</span>`);
      else if (est === 'hoy') meta.push('<span class="badge warn">Vence hoy</span>');
      else if (venc) meta.push(`<span>Vence ${esc(ddmm(venc))}</span>`);
      else meta.push('<span>Sin vencimiento</span>');
      const medio = nombreMedio(p.medioSugeridoId);
      if (medio) meta.push(`<span>· ${esc(medio)}</span>`);
    }
    if (p.categoria === 'reserva') meta.push('<span class="badge reserva">Reserva</span>');

    const icono = est === 'pagado' ? ICON.check : est === 'vencido' ? ICON.alerta : '';
    const alias = p.alias
      ? `<div class="row-alias"><span class="alias-text" title="${esc(p.alias)}">${esc(p.alias)}</span>
           <button type="button" class="copy-btn" data-action="copiar" data-texto="${esc(p.alias)}" aria-label="Copiar alias de ${esc(p.nombre)}">Copiar</button></div>`
      : '';

    return `<li class="row ${est}">
      <button type="button" class="row-main" data-action="abrir-pago" data-id="${esc(p.id)}">
        <span class="status">${icono}</span>
        <span class="row-body">
          <span class="row-top"><span class="row-name">${esc(p.nombre)}</span>${monto}</span>
          <span class="row-meta">${meta.join('')}</span>
        </span>
      </button>${alias}
    </li>`;
  }

  // ---------- Resumen ----------
  function vistaResumen() {
    const clave = ui.mes;
    if (!state.meses[clave] && !asegurarMes(clave)) {
      return `<div class="card empty-state"><p>No hay datos para ${esc(nombreMes(clave))}.</p></div>`;
    }
    const t = totales(clave);
    const catCard = (k) => {
      const c = t.cat[k];
      const pct = c.estimado > 0 ? Math.min(100, Math.round((c.pagado / c.estimado) * 100)) : (c.n && c.np === c.n ? 100 : 0);
      return `<section class="card">
        <div class="cat-head"><h3>${CATEGORIAS[k]}</h3><span class="badge ${k === 'reserva' ? 'reserva' : ''}">${c.np} de ${c.n}</span></div>
        <div class="stat-list">
          <div class="stat"><span class="label">Pagado</span><span class="value ok">${money(c.pagado)}</span></div>
          <div class="stat"><span class="label">Pendiente</span><span class="value">${money(c.pendiente)}</span></div>
          <div class="stat"><span class="label">Estimado</span><span class="value">${money(c.estimado)}</span></div>
        </div>
        <div class="bar ${k === 'reserva' ? 'reserva' : ''}" aria-hidden="true"><span style="width:${pct}%"></span></div>
      </section>`;
    };

    const medios = Object.entries(t.porMedio).sort((a, b) => b[1] - a[1]);
    const max = medios.length ? Math.max(...medios.map((m) => m[1])) : 0;
    const barras = medios.length
      ? `<div class="medio-bars">${medios.map(([nombre, monto]) => `
          <div class="medio-bar">
            <div class="top"><span>${esc(nombre)}</span><b>${money(monto)}</b></div>
            <div class="bar" aria-hidden="true"><span style="width:${max > 0 ? Math.max(2, Math.round((monto / max) * 100)) : 0}%"></span></div>
          </div>`).join('')}</div>`
      : '<p class="cat-sub" style="margin:0">Todavía no hay pagos registrados este mes.</p>';

    return `<h2 class="section-title">Totales del mes</h2>
      <section class="card"><div class="stat-list">
        <div class="stat big"><span class="label">Total pagado</span><span class="value ok">${money(t.pagado)}</span></div>
        <div class="stat"><span class="label">Total pendiente</span><span class="value warn">${money(t.pendiente)}</span></div>
        <div class="stat"><span class="label">Total estimado</span><span class="value">${money(t.estimado)}</span></div>
      </div>
      <p class="cat-sub">${t.pagados} de ${t.cantidad} pagados. El pendiente se calcula con los montos estimados.</p></section>
      <h2 class="section-title">Por categoría</h2>
      ${catCard('consumo')}
      ${catCard('reserva')}
      <h2 class="section-title">Pagado por medio de pago</h2>
      <section class="card">${barras}</section>`;
  }

  // ---------- Historial ----------
  function vistaHistorial() {
    const actual = mesActual();
    // Los meses futuros solo aparecen si ya tienen algún pago hecho.
    const claves = Object.keys(state.meses)
      .filter((k) => k <= actual || state.meses[k].pagos.some((p) => p.estado === 'pagado'))
      .sort().reverse();
    if (!claves.length) return '<div class="card empty-state"><p>Todavía no hay meses guardados.</p></div>';
    return `<p class="cat-sub" style="margin:0 4px 12px">Tocá un mes para ver sus pagos.</p><ul class="list">${claves.map((k) => {
      const t = totales(k);
      const etiqueta = k === actual ? ' <span class="badge ok">Este mes</span>' : k > actual ? ' <span class="badge">Próximo</span>' : '';
      return `<li><button type="button" class="hist-btn" data-action="abrir-mes" data-mes="${k}">
        <span class="hist-body">
          <span class="hist-name">${esc(nombreMes(k))}${etiqueta}</span>
          <span class="hist-meta" style="display:block">${t.pagados} de ${t.cantidad} pagados</span>
        </span>
        <span class="hist-amount">${money(t.pagado)}<small>pagado</small></span>
        ${ICON.chev}
      </button></li>`;
    }).join('')}</ul>`;
  }

  // ---------- Configuración ----------
  function vistaConfig() {
    const lista = (cat) => {
      const items = conceptosOrdenados().filter((c) => c.categoria === cat);
      if (!items.length) return '<ul class="cfg-list"><li class="empty">No hay conceptos en esta categoría.</li></ul>';
      return `<ul class="cfg-list">${items.map((c, i) => {
        const meta = [
          c.montoEstimado != null ? money(c.montoEstimado) : 'Sin monto',
          c.vencimientoDia ? `día ${c.vencimientoDia}` : null,
          nombreMedio(c.medioSugeridoId) || null,
          c.alias ? `alias ${c.alias}` : null
        ].filter(Boolean).join(' · ');
        return `<li class="cfg-row ${c.activo ? '' : 'inactivo'}">
          <button type="button" class="cfg-main" data-action="editar-concepto" data-id="${esc(c.id)}">
            <span class="cfg-name">${esc(c.nombre)}${c.activo ? '' : ' <span class="badge">Inactivo</span>'}</span>
            <span class="cfg-meta">${esc(meta)}</span>
          </button>
          <span class="cfg-actions">
            <button type="button" class="icon-btn small" data-action="subir" data-id="${esc(c.id)}" aria-label="Subir ${esc(c.nombre)}" ${i === 0 ? 'disabled' : ''}>${ICON.arriba}</button>
            <button type="button" class="icon-btn small" data-action="bajar" data-id="${esc(c.id)}" aria-label="Bajar ${esc(c.nombre)}" ${i === items.length - 1 ? 'disabled' : ''}>${ICON.abajo}</button>
            <label class="switch" title="Activo">
              <input type="checkbox" role="switch" data-change="toggle-activo" data-id="${esc(c.id)}" ${c.activo ? 'checked' : ''} aria-label="${esc(c.nombre)} activo">
              <span class="track"></span>
            </label>
          </span>
        </li>`;
      }).join('')}</ul>`;
    };

    const medios = state.medios.length
      ? state.medios.map((m) => `<li class="cfg-row">
          <span class="cfg-main" style="min-height:52px"><span class="cfg-name">${esc(m.nombre)}</span></span>
          <span class="cfg-actions">
            <button type="button" class="text-btn" data-action="editar-medio" data-id="${esc(m.id)}">Editar</button>
            <button type="button" class="text-btn danger" data-action="borrar-medio" data-id="${esc(m.id)}">Borrar</button>
          </span>
        </li>`).join('')
      : '<li class="empty">No hay medios de pago.</li>';

    return `<div class="notice">${ICON.info}<span>Tus datos se guardan solo en este teléfono. Exportá un respaldo cada tanto.</span></div>

      <h2 class="section-title">Conceptos · Consumo</h2>
      ${lista('consumo')}
      <h2 class="section-title">Conceptos · Reserva/Ahorro</h2>
      ${lista('reserva')}
      <button type="button" class="btn btn-primary btn-block" style="margin-top:12px" data-action="nuevo-concepto">+ Agregar concepto</button>
      <p class="cat-sub" style="margin:8px 4px 0">Los cambios en un concepto se aplican a los pagos pendientes de este mes en adelante. Los pagos ya hechos y los meses anteriores no cambian.</p>

      <h2 class="section-title">Medios de pago</h2>
      <ul class="cfg-list">${medios}</ul>
      <form class="add-row" id="formMedio" autocomplete="off">
        <input type="text" id="nuevoMedio" placeholder="Nuevo medio de pago" aria-label="Nuevo medio de pago" maxlength="40">
        <button type="submit" class="btn btn-primary">Agregar</button>
      </form>

      <h2 class="section-title">Respaldo</h2>
      <div class="stack">
        <button type="button" class="btn btn-secondary btn-block" data-action="exportar-json">Exportar respaldo (JSON)</button>
        <button type="button" class="btn btn-secondary btn-block" data-action="exportar-csv">Exportar para Excel (CSV)</button>
        <button type="button" class="btn btn-secondary btn-block" data-action="importar-json">Importar respaldo (JSON)</button>
      </div>

      <p class="about">Control de gastos Ju · ${state.conceptos.length} conceptos · ${(() => { const n = Object.keys(state.meses).length; return n === 1 ? '1 mes guardado' : `${n} meses guardados`; })()}</p>`;
  }

  // ============================================================
  // Panel inferior (sheet)
  // ============================================================
  const sheet = $('#sheet');

  function abrirSheet(titulo, sub, cuerpo) {
    sheet.innerHTML = `<div class="sheet-head">
        <h2 id="sheetTitle">${esc(titulo)}</h2>
        ${sub ? `<div class="sub">${sub}</div>` : ''}
        <button type="button" class="icon-btn small sheet-close" data-action="cerrar-sheet" aria-label="Cerrar">${ICON.cerrar}</button>
      </div>
      <div class="sheet-body">${cuerpo}</div>`;
    if (!sheet.open) sheet.showModal();
    const body = $('.sheet-body', sheet);
    body.scrollTop = 0;
  }
  function cerrarSheet() { if (sheet.open) sheet.close(); }

  sheet.addEventListener('click', (e) => { if (e.target === sheet) cerrarSheet(); });

  const chipsHTML = (nombre, opciones, seleccion) => `<div class="chips" role="radiogroup" data-grupo="${nombre}">
      ${opciones.map((o) => `<button type="button" class="chip ${o.clase || ''}" role="radio" data-action="chip" data-valor="${esc(o.valor)}" aria-checked="${o.valor === seleccion}">${esc(o.texto)}</button>`).join('')}
    </div>`;

  const valorChip = (form, grupo) => {
    const el = form.querySelector(`[data-grupo="${grupo}"] [aria-checked="true"]`);
    return el ? el.dataset.valor : null;
  };

  // ---------- Marcar como pagado ----------
  function buscarPago(id) {
    const mes = state.meses[ui.mes];
    return mes ? mes.pagos.find((p) => p.id === id) : null;
  }

  function abrirPago(id) {
    const p = buscarPago(id);
    if (!p) return;
    const clave = ui.mes;
    const pagado = p.estado === 'pagado';
    const est = estadoDe(p, clave);
    const venc = fechaVencimiento(p, clave);

    const sub = [
      CATEGORIAS[p.categoria],
      venc ? (est === 'vencido' ? `venció el ${ddmm(venc)}` : `vence el ${ddmm(venc)}`) : null,
      p.montoEstimado != null ? `estimado ${money(p.montoEstimado)}` : null
    ].filter(Boolean).map(esc).join(' · ');

    const monto = pagado ? p.montoPagado : p.montoEstimado;
    const medioSel = pagado ? p.medioUsadoId : p.medioSugeridoId;
    const opcionesMedio = state.medios.map((m) => ({ valor: m.id, texto: m.nombre }));
    // Si el medio usado se borró, se muestra igual para no perder el dato.
    if (pagado && p.medioUsadoId && !medioPorId(p.medioUsadoId) && p.medioUsadoNombre) {
      opcionesMedio.push({ valor: p.medioUsadoId, texto: p.medioUsadoNombre });
    }

    const alias = p.alias
      ? `<div class="sheet-alias"><span class="alias-text">${esc(p.alias)}</span><button type="button" class="copy-btn" data-action="copiar" data-texto="${esc(p.alias)}">Copiar</button></div>`
      : '';

    abrirSheet(p.nombre, sub, `${alias}
      <form id="formPago" novalidate autocomplete="off">
        ${pagado ? `<p class="sheet-note"><span class="badge ok">Pagado el ${esc(fechaLarga(p.fechaPago))}</span></p>` : ''}
        <div class="field" id="campoMonto">
          <label for="pMonto">Monto pagado</label>
          <div class="input-money"><span>$</span><input type="text" id="pMonto" inputmode="decimal" value="${esc(montoParaInput(monto))}" placeholder="0,00"></div>
          <span class="error" id="errMonto" hidden>Ingresá un monto válido, por ejemplo 12.345,67</span>
        </div>
        <div class="field">
          <span class="label">Medio de pago</span>
          ${opcionesMedio.length ? chipsHTML('medio', opcionesMedio, medioSel) : '<span class="hint">No hay medios de pago. Agregalos en Configuración.</span>'}
        </div>
        <div class="field">
          <label for="pFecha">Fecha de pago</label>
          <input type="date" id="pFecha" value="${esc(pagado && p.fechaPago ? p.fechaPago : hoyISO())}">
        </div>
        <div class="field">
          <label for="pNota">Nota (opcional)</label>
          <textarea id="pNota" rows="2" maxlength="300" placeholder="Ej.: pagué con recargo">${esc(p.nota)}</textarea>
        </div>
        <div class="stack">
          <button type="submit" class="btn btn-primary btn-block">${pagado ? 'Guardar cambios' : 'Marcar como pagado'}</button>
          ${pagado ? '<button type="button" class="btn btn-danger-outline btn-block" data-action="deshacer-pago">Deshacer pago</button>' : ''}
          <button type="button" class="btn btn-secondary btn-block" data-action="cerrar-sheet">Cancelar</button>
        </div>
      </form>`);

    const form = $('#formPago');
    form.dataset.id = p.id;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = parseMonto($('#pMonto').value);
      if (n === null || isNaN(n)) {
        $('#campoMonto').classList.add('invalid');
        $('#errMonto').hidden = false;
        $('#pMonto').focus();
        return;
      }
      const fecha = esFecha($('#pFecha').value) ? $('#pFecha').value : hoyISO();
      const medioId = valorChip(form, 'medio');
      const antes = { ...p };
      Object.assign(p, {
        estado: 'pagado',
        montoPagado: n,
        medioUsadoId: medioId,
        medioUsadoNombre: medioId ? nombreMedio(medioId, p.medioUsadoNombre) : null,
        fechaPago: fecha,
        nota: $('#pNota').value.trim()
      });
      guardar();
      cerrarSheet();
      render();
      if (antes.estado !== 'pagado') {
        toast(`${p.nombre}: pagado`, { texto: 'Deshacer', fn: () => { Object.assign(p, antes); guardar(); render(); } });
      } else {
        toast('Cambios guardados');
      }
    });
  }

  async function deshacerPago(id) {
    const p = buscarPago(id);
    if (!p) return;
    const ok = await confirmar({
      titulo: '¿Deshacer el pago?',
      mensaje: `${p.nombre} vuelve a quedar pendiente y se borran el monto pagado, el medio, la fecha y la nota.`,
      ok: 'Deshacer pago',
      peligro: true
    });
    if (!ok) return;
    Object.assign(p, { estado: 'pendiente', montoPagado: null, medioUsadoId: null, medioUsadoNombre: null, fechaPago: null, nota: '' });
    // Si el mes es actual o futuro, vuelve a tomar los datos del concepto.
    sincronizarConceptos();
    guardar();
    cerrarSheet();
    render();
    toast(`${p.nombre}: pendiente otra vez`);
  }

  // ---------- Conceptos ----------
  function abrirConcepto(id) {
    const c = id ? conceptoPorId(id) : null;
    const nuevo = !c;
    const d = c || { nombre: '', categoria: 'consumo', montoEstimado: null, vencimientoDia: null, medioSugeridoId: null, alias: '', activo: true };
    const opcionesMedio = [{ valor: '', texto: 'Ninguno' }].concat(state.medios.map((m) => ({ valor: m.id, texto: m.nombre })));

    abrirSheet(nuevo ? 'Nuevo concepto' : 'Editar concepto', nuevo ? '' : esc(c.nombre), `
      <form id="formConcepto" novalidate autocomplete="off">
        <div class="field" id="campoNombre">
          <label for="cNombre">Nombre</label>
          <input type="text" id="cNombre" value="${esc(d.nombre)}" maxlength="60" placeholder="Ej.: Internet">
          <span class="error" id="errNombre" hidden>Poné un nombre.</span>
        </div>
        <div class="field">
          <span class="label">Categoría</span>
          ${chipsHTML('categoria', [
            { valor: 'consumo', texto: 'Consumo' },
            { valor: 'reserva', texto: 'Reserva/Ahorro', clase: 'cat-reserva' }
          ], d.categoria)}
        </div>
        <div class="field" id="campoEstimado">
          <label for="cMonto">Monto estimado (opcional)</label>
          <div class="input-money"><span>$</span><input type="text" id="cMonto" inputmode="decimal" value="${esc(montoParaInput(d.montoEstimado))}" placeholder="0,00"></div>
          <span class="error" id="errEstimado" hidden>Ingresá un monto válido, por ejemplo 12.345,67</span>
        </div>
        <div class="field" id="campoDia">
          <label for="cDia">Día de vencimiento (opcional)</label>
          <input type="number" id="cDia" inputmode="numeric" min="1" max="31" value="${esc(d.vencimientoDia || '')}" placeholder="1 a 31">
          <span class="hint">Si el mes tiene menos días, vence el último día.</span>
          <span class="error" id="errDia" hidden>Tiene que ser un número del 1 al 31.</span>
        </div>
        <div class="field">
          <span class="label">Medio de pago sugerido (opcional)</span>
          ${chipsHTML('medio', opcionesMedio, d.medioSugeridoId || '')}
        </div>
        <div class="field">
          <label for="cAlias">Alias o CBU para transferir (opcional)</label>
          <input type="text" id="cAlias" value="${esc(d.alias)}" maxlength="60" autocapitalize="off" spellcheck="false" placeholder="Ej.: mi.alias.mp">
        </div>
        <div class="toggle-line">
          <span class="label">Activo</span>
          <label class="switch"><input type="checkbox" role="switch" id="cActivo" ${d.activo ? 'checked' : ''} aria-label="Activo"><span class="track"></span></label>
        </div>
        <p class="sheet-note">Los cambios se aplican a los pagos pendientes de este mes en adelante. Los pagos ya hechos y los meses anteriores no cambian.</p>
        <div class="stack">
          <button type="submit" class="btn btn-primary btn-block">${nuevo ? 'Agregar concepto' : 'Guardar cambios'}</button>
          ${nuevo ? '' : '<button type="button" class="btn btn-danger-outline btn-block" data-action="borrar-concepto">Eliminar concepto</button>'}
          <button type="button" class="btn btn-secondary btn-block" data-action="cerrar-sheet">Cancelar</button>
        </div>
      </form>`);

    const form = $('#formConcepto');
    form.dataset.id = c ? c.id : '';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let ok = true;
      const nombre = $('#cNombre').value.trim();
      const monto = parseMonto($('#cMonto').value);
      const diaTxt = $('#cDia').value.trim();
      const dia = diaTxt ? Number(diaTxt) : null;

      const marcar = (campo, err, mal) => { $(campo).classList.toggle('invalid', mal); $(err).hidden = !mal; if (mal) ok = false; };
      marcar('#campoNombre', '#errNombre', !nombre);
      marcar('#campoEstimado', '#errEstimado', monto !== null && isNaN(monto));
      marcar('#campoDia', '#errDia', dia !== null && !(Number.isInteger(dia) && dia >= 1 && dia <= 31));
      if (!ok) { const inv = form.querySelector('.invalid input'); if (inv) inv.focus(); return; }

      const datos = {
        nombre,
        categoria: valorChip(form, 'categoria') || 'consumo',
        montoEstimado: monto,
        vencimientoDia: dia,
        medioSugeridoId: valorChip(form, 'medio') || null,
        alias: $('#cAlias').value.trim(),
        activo: $('#cActivo').checked
      };
      if (nuevo) {
        const orden = state.conceptos.reduce((m, x) => Math.max(m, x.orden), -1) + 1;
        state.conceptos.push({ id: uid(), orden, ...datos });
      } else {
        Object.assign(c, datos);
      }
      sincronizarConceptos();
      guardar();
      cerrarSheet();
      render();
      toast(nuevo ? 'Concepto agregado' : 'Concepto guardado');
    });
  }

  async function borrarConcepto(id) {
    const c = conceptoPorId(id);
    if (!c) return;
    const ok = await confirmar({
      titulo: `¿Eliminar "${c.nombre}"?`,
      mensaje: 'Deja de aparecer en los meses nuevos y se quita de los pendientes de este mes en adelante. Los pagos ya hechos se conservan en el historial.\n\nSi solo querés pausarlo, desactivalo en lugar de eliminarlo.',
      ok: 'Eliminar',
      peligro: true
    });
    if (!ok) return;
    state.conceptos = state.conceptos.filter((x) => x.id !== id);
    sincronizarConceptos();
    guardar();
    cerrarSheet();
    render();
    toast('Concepto eliminado');
  }

  function moverConcepto(id, dir) {
    const c = conceptoPorId(id);
    if (!c) return;
    const grupo = conceptosOrdenados().filter((x) => x.categoria === c.categoria);
    const i = grupo.findIndex((x) => x.id === id);
    const j = i + dir;
    if (j < 0 || j >= grupo.length) return;
    const otro = grupo[j];
    [c.orden, otro.orden] = [otro.orden, c.orden];
    sincronizarConceptos();
    guardar();
    render();
    // Mantiene el foco en el mismo botón para poder seguir moviendo.
    const btn = main.querySelector(`[data-action="${dir < 0 ? 'subir' : 'bajar'}"][data-id="${CSS.escape(id)}"]`);
    if (btn && !btn.disabled) btn.focus();
  }

  function toggleActivo(id, activo) {
    const c = conceptoPorId(id);
    if (!c) return;
    c.activo = activo;
    sincronizarConceptos();
    guardar();
    render();
    toast(activo ? `${c.nombre}: activo` : `${c.nombre}: desactivado`);
  }

  // ---------- Medios de pago ----------
  const medioRepetido = (nombre, exceptoId) =>
    state.medios.some((m) => m.id !== exceptoId && m.nombre.toLocaleLowerCase('es') === nombre.toLocaleLowerCase('es'));

  function agregarMedio(nombre) {
    nombre = nombre.trim();
    if (!nombre) return false;
    if (medioRepetido(nombre)) { toast('Ese medio de pago ya existe'); return false; }
    state.medios.push({ id: uid(), nombre });
    guardar();
    render();
    toast('Medio de pago agregado');
    return true;
  }

  function editarMedio(id) {
    const m = medioPorId(id);
    if (!m) return;
    abrirSheet('Editar medio de pago', '', `
      <form id="formMedioEdit" novalidate autocomplete="off">
        <div class="field" id="campoMedio">
          <label for="mNombre">Nombre</label>
          <input type="text" id="mNombre" value="${esc(m.nombre)}" maxlength="40">
          <span class="error" id="errMedio" hidden></span>
        </div>
        <div class="stack">
          <button type="submit" class="btn btn-primary btn-block">Guardar</button>
          <button type="button" class="btn btn-secondary btn-block" data-action="cerrar-sheet">Cancelar</button>
        </div>
      </form>`);
    $('#formMedioEdit').addEventListener('submit', (e) => {
      e.preventDefault();
      const nombre = $('#mNombre').value.trim();
      const err = !nombre ? 'Poné un nombre.' : medioRepetido(nombre, id) ? 'Ese medio de pago ya existe.' : '';
      $('#campoMedio').classList.toggle('invalid', !!err);
      $('#errMedio').textContent = err;
      $('#errMedio').hidden = !err;
      if (err) return;
      m.nombre = nombre;
      guardar();
      cerrarSheet();
      render();
      toast('Medio de pago guardado');
    });
  }

  async function borrarMedio(id) {
    const m = medioPorId(id);
    if (!m) return;
    const usos = state.conceptos.filter((c) => c.medioSugeridoId === id).length;
    const ok = await confirmar({
      titulo: `¿Borrar "${m.nombre}"?`,
      mensaje: (usos ? `Es el medio sugerido de ${usos} concepto${usos === 1 ? '' : 's'}; van a quedar sin medio sugerido.\n\n` : '') +
        'Los pagos ya hechos con este medio conservan el nombre en el historial.',
      ok: 'Borrar',
      peligro: true
    });
    if (!ok) return;
    // Guarda el nombre en los pagos hechos para que el historial no lo pierda.
    Object.values(state.meses).forEach((mes) => mes.pagos.forEach((p) => {
      if (p.medioUsadoId === id) p.medioUsadoNombre = m.nombre;
    }));
    state.conceptos.forEach((c) => { if (c.medioSugeridoId === id) c.medioSugeridoId = null; });
    state.medios = state.medios.filter((x) => x.id !== id);
    sincronizarConceptos();
    guardar();
    render();
    toast('Medio de pago borrado');
  }

  // ============================================================
  // Exportar e importar
  // ============================================================
  const esIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  async function descargar(nombre, contenido, tipo) {
    const blob = new Blob([contenido], { type: tipo });
    // En iPhone, compartir funciona mejor que descargar (permite guardar en Archivos).
    if (esIOS() && typeof File === 'function' && navigator.canShare) {
      try {
        const archivo = new File([blob], nombre, { type: tipo });
        if (navigator.canShare({ files: [archivo] })) {
          await navigator.share({ files: [archivo], title: nombre });
          return;
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast('Archivo descargado');
    } catch (e) {
      toast('No se pudo exportar el archivo');
    }
  }

  function exportarJSON() {
    const datos = { app: 'Control de gastos Ju', exportado: new Date().toISOString(), ...state };
    descargar(`gastos-ju-respaldo-${hoyISO()}.json`, JSON.stringify(datos, null, 2), 'application/json');
  }

  function exportarCSV() {
    const celda = (v) => {
      const s = String(v == null ? '' : v);
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const num = (n) => (n == null ? '' : Number(n).toFixed(2).replace('.', ','));
    const filas = [['Mes', 'Concepto', 'Categoría', 'Monto estimado', 'Estado', 'Monto pagado', 'Medio de pago', 'Fecha de pago', 'Vencimiento', 'Alias', 'Nota']];
    Object.keys(state.meses).sort().forEach((k) => {
      ordenarPagos(state.meses[k].pagos, k).forEach((p) => {
        filas.push([
          k, p.nombre, CATEGORIAS[p.categoria], num(p.montoEstimado),
          p.estado === 'pagado' ? 'Pagado' : 'Pendiente',
          num(p.montoPagado), nombreMedio(p.medioUsadoId, p.medioUsadoNombre),
          fechaLarga(p.fechaPago), fechaLarga(fechaVencimiento(p, k)), p.alias, p.nota
        ]);
      });
    });
    // Punto y coma y coma decimal: así lo abre bien Excel configurado en español.
    const csv = '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
    descargar(`gastos-ju-${hoyISO()}.csv`, csv, 'text/csv;charset=utf-8');
  }

  async function importarArchivo(file) {
    let texto;
    try {
      texto = await file.text();
    } catch (e) {
      toast('No se pudo leer el archivo');
      return;
    }
    let d;
    try { d = JSON.parse(texto); } catch (e) { d = null; }
    if (!esEstadoValido(d)) {
      await confirmar({ titulo: 'Archivo no válido', mensaje: 'Ese archivo no es un respaldo de Control de gastos Ju.', ok: 'Entendido' });
      return;
    }
    const nuevo = normalizar(d);
    const ok = await confirmar({
      titulo: '¿Importar respaldo?',
      mensaje: `El respaldo tiene ${nuevo.conceptos.length} conceptos, ${nuevo.medios.length} medios de pago y ${Object.keys(nuevo.meses).length} meses.\n\nVa a REEMPLAZAR todos los datos actuales de este teléfono. Si querés conservarlos, exportá un respaldo antes.`,
      ok: 'Reemplazar datos',
      peligro: true
    });
    if (!ok) return;
    state = nuevo;
    if (!guardar()) { toast('No se pudo guardar el respaldo importado'); return; }
    ui.mes = mesActual();
    render();
    toast('Respaldo importado');
  }

  // ============================================================
  // Eventos
  // ============================================================
  document.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.tabbar button[data-tab]');
    if (tabBtn) { irATab(tabBtn.dataset.tab); return; }

    const el = e.target.closest('[data-action]');
    if (!el) return;
    const id = el.dataset.id;
    const formId = el.closest('form') && el.closest('form').dataset.id;

    switch (el.dataset.action) {
      case 'mes-anterior': ui.mes = sumarMeses(ui.mes, -1); render(); break;
      case 'mes-siguiente': ui.mes = sumarMeses(ui.mes, 1); render(); break;
      case 'mes-actual': ui.mes = mesActual(); render(); break;
      case 'generar-mes': asegurarMes(ui.mes, true); render(); break;
      case 'ir-config': irATab('config'); break;
      case 'abrir-mes': ui.mes = el.dataset.mes; irATab('mes'); break;
      case 'abrir-pago': abrirPago(id); break;
      case 'copiar': copiar(el.dataset.texto); break;
      case 'deshacer-pago': deshacerPago(formId); break;
      case 'cerrar-sheet': cerrarSheet(); break;
      case 'chip': {
        const grupo = el.closest('[role="radiogroup"]');
        const yaElegido = el.getAttribute('aria-checked') === 'true';
        grupo.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-checked', 'false'));
        // Tocar de nuevo el elegido lo deselecciona (salvo en categoría, que es obligatoria).
        if (!yaElegido || grupo.dataset.grupo === 'categoria') el.setAttribute('aria-checked', 'true');
        break;
      }
      case 'nuevo-concepto': abrirConcepto(null); break;
      case 'editar-concepto': abrirConcepto(id); break;
      case 'borrar-concepto': borrarConcepto(formId); break;
      case 'subir': moverConcepto(id, -1); break;
      case 'bajar': moverConcepto(id, 1); break;
      case 'editar-medio': editarMedio(id); break;
      case 'borrar-medio': borrarMedio(id); break;
      case 'exportar-json': exportarJSON(); break;
      case 'exportar-csv': exportarCSV(); break;
      case 'importar-json': $('#importFile').value = ''; $('#importFile').click(); break;
      default: break;
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.change === 'toggle-activo') toggleActivo(el.dataset.id, el.checked);
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'formMedio') return;
    e.preventDefault();
    const input = $('#nuevoMedio');
    if (agregarMedio(input.value)) {
      const nuevo = $('#nuevoMedio');
      if (nuevo) nuevo.focus();
    }
  });

  document.addEventListener('input', (e) => {
    const campo = e.target.closest('.field.invalid');
    if (campo) {
      campo.classList.remove('invalid');
      const err = campo.querySelector('.error');
      if (err) err.hidden = true;
    }
  });

  $('#importFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importarArchivo(f);
  });

  // Si la app queda abierta y cambia el día o el mes, se actualiza sola.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const actual = mesActual();
    if (actual !== ui.ultimoMesVisto) {
      if (ui.mes === ui.ultimoMesVisto) ui.mes = actual;
      ui.ultimoMesVisto = actual;
    }
    if (!sheet.open) render();
  });

  // ============================================================
  // Inicio
  // ============================================================
  if (esPrimeraVez) guardar();
  asegurarMes(mesActual());
  $('#storageBanner').hidden = guardadoOk;
  render();
  if (avisoInicial) toast(avisoInicial);

  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (e) { /* no disponible */ }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* sin https no hay modo offline */ });
    });
  }
})();
