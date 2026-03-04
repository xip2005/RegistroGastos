import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from './lib/supabase';
import { 
  PlusCircle, 
  MinusCircle, 
  Printer, 
  Trash2,
  Download,
  Upload,
  LogOut,
  ShieldCheck,
  Utensils,     // FASTFOOD
  Lightbulb,    // LIGHTBULB
  Gamepad2,     // GAMES
  Bus,          // DIRECTIONS_BUS
  ShoppingCart, // SHOPPING_CART
  Bug,          // BUG_REPORT
  PiggyBank,    // SAVINGS
  DollarSign,   // ATTACH_MONEY
  HelpCircle
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, subDays } from 'date-fns';

type Categoria = {
  id: string;
  nombre: string;
  icono: string;
};

type Movimiento = {
  id: string;
  monto: number;
  descripcion: string;
  fecha: string;
  tipo: 'INGRESO' | 'GASTO';
  categoria_id: string;
  usuario_id: string;
  categorias?: Categoria; // Relación desde Supabase
};

type FiltroTipoHistorial = 'TODOS' | 'GASTO' | 'INGRESO';
type OperacionAhorro = 'AHORRO' | 'RETIRO';
type VistaPrincipal = 'MOVIMIENTOS' | 'AHORRO' | 'TARJETA';
type TarjetaTipo = 'GASTO' | 'PAGO';
const MOVIMIENTOS_TABLE = 'fin_movimientos';
const SESSION_KEY = 'registrogastos_auth';
const LOGIN_RPC = 'fin_login_multi';
const DEUDA_INICIAL_TARJETA_KEY = 'registrogastos_deuda_inicial_tarjeta';
const LIMITE_TARJETA_KEY = 'registrogastos_limite_tarjeta';
const MOVIMIENTOS_TARJETA_KEY = 'registrogastos_movimientos_tarjeta';
const PRESUPUESTO_INGRESO_BASE_KEY = 'registrogastos_presupuesto_ingreso_base';

type AuthSession = {
  ok: true;
  userId: string;
  usuario: string;
};

type LoginRpcResponse = {
  ok: boolean;
  user_id: string | null;
  usuario: string | null;
  estado_pago: string | null;
  mensaje: string | null;
};

type MovimientoTarjeta = {
  id: string;
  tipo: TarjetaTipo;
  monto: number;
  descripcion: string;
  fecha: string;
};

type BackupPayload = {
  version: 1;
  exportedAt: string;
  categorias: Array<{
    id: string;
    nombre: string;
    icono: string;
  }>;
  movimientos: Array<{
    id: string;
    monto: number;
    descripcion: string;
    fecha: string;
    tipo: 'INGRESO' | 'GASTO';
    categoria_id: string;
    usuario_id?: string;
  }>;
  tarjeta?: {
    deudaInicial: string;
    limite: string;
    movimientos: MovimientoTarjeta[];
  };
};

// Mapeo simple de iconos de Material a Lucide
const iconMap: Record<string, React.ReactNode> = {
  'FASTFOOD': <Utensils className="w-5 h-5 text-orange-500" />,
  'LIGHTBULB': <Lightbulb className="w-5 h-5 text-yellow-500" />,
  'GAMES': <Gamepad2 className="w-5 h-5 text-purple-500" />,
  'DIRECTIONS_BUS': <Bus className="w-5 h-5 text-blue-500" />,
  'SHOPPING_CART': <ShoppingCart className="w-5 h-5 text-green-500" />,
  'BUG_REPORT': <Bug className="w-5 h-5 text-red-500" />,
  'SAVINGS': <PiggyBank className="w-5 h-5 text-teal-500" />,
  'ATTACH_MONEY': <DollarSign className="w-5 h-5 text-emerald-600" />
};

const gsFormatter = new Intl.NumberFormat('es-PY', {
  style: 'currency',
  currency: 'PYG',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const gsFormatterNoDecimals = new Intl.NumberFormat('es-PY', {
  style: 'currency',
  currency: 'PYG',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const gsInputFormatter = new Intl.NumberFormat('es-PY', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatGs(value: number) {
  return gsFormatter.format(value);
}

function formatGsNoDecimals(value: number) {
  return gsFormatterNoDecimals.format(value);
}

function formatGsInputFromDigits(rawValue: string) {
  const digitsOnly = rawValue.replace(/\D/g, '');

  if (!digitsOnly) {
    return '';
  }

  return gsInputFormatter.format(Number(digitsOnly));
}

function parseGsInputToNumber(value: string) {
  const normalized = value.replace(/\./g, '').replace(',', '.').trim();
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function readAuthSession(): AuthSession | null {
  const raw = sessionStorage.getItem(SESSION_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (parsed.ok === true && typeof parsed.userId === 'string' && parsed.userId && typeof parsed.usuario === 'string') {
      return {
        ok: true,
        userId: parsed.userId,
        usuario: parsed.usuario,
      };
    }
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
  }

  return null;
}

function getScopedStorageKey(baseKey: string, userId: string) {
  return `${baseKey}:${userId}`;
}

export default function App() {
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => readAuthSession());
  const [isAuthenticated, setIsAuthenticated] = useState(() => readAuthSession() !== null);
  const authUserId = authSession?.userId ?? null;
  const authUsuario = authSession?.usuario ?? '';
  const [loginUser, setLoginUser] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginMonthlyKey, setLoginMonthlyKey] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [historialAhorro, setHistorialAhorro] = useState<Movimiento[]>([]);
  
  // Formulario
  const [monto, setMonto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipo, setTipo] = useState<'INGRESO'|'GASTO'>('GASTO');
  const [categoriaId, setCategoriaId] = useState('');
  const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Filtros
  const [fechaInicio, setFechaInicio] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [fechaFin, setFechaFin] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [busquedaHistorial, setBusquedaHistorial] = useState('');
  const [filtroTipoHistorial, setFiltroTipoHistorial] = useState<FiltroTipoHistorial>('TODOS');
  const [mostrarModalMovimiento, setMostrarModalMovimiento] = useState(false);
  const [mostrarPresupuesto, setMostrarPresupuesto] = useState(false);
  const [mostrarHistorialDetalle, setMostrarHistorialDetalle] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    return window.innerWidth >= 640;
  });
  const [presupuestoIngresoBase, setPresupuestoIngresoBase] = useState('');
  const [deudaInicialTarjeta, setDeudaInicialTarjeta] = useState('1.997.217');
  const [limiteTarjeta, setLimiteTarjeta] = useState('2.200.000');
  const [movimientosTarjeta, setMovimientosTarjeta] = useState<MovimientoTarjeta[]>([]);
  const [tarjetaTipo, setTarjetaTipo] = useState<TarjetaTipo>('GASTO');
  const [tarjetaMonto, setTarjetaMonto] = useState('');
  const [tarjetaDescripcion, setTarjetaDescripcion] = useState('');
  const [tarjetaFecha, setTarjetaFecha] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [mesTarjeta, setMesTarjeta] = useState(format(new Date(), 'yyyy-MM'));
  const [resumenCierreMes, setResumenCierreMes] = useState<null | {
    mes: string;
    gastos: number;
    pagos: number;
    variacion: number;
  }>(null);
  const [ahorroMonto, setAhorroMonto] = useState('');
  const [ahorroDescripcion, setAhorroDescripcion] = useState('Ahorro');
  const [ahorroFecha, setAhorroFecha] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [ahorroOperacion, setAhorroOperacion] = useState<OperacionAhorro>('AHORRO');
  const [fechaAhorroInicio, setFechaAhorroInicio] = useState(format(startOfMonth(subDays(new Date(), 59)), 'yyyy-MM-dd'));
  const [fechaAhorroFin, setFechaAhorroFin] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [vistaActiva, setVistaActiva] = useState<VistaPrincipal>('MOVIMIENTOS');
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !authUserId) {
      return;
    }

    cargarCategorias();
    cargarMovimientos();
  }, [isAuthenticated, authUserId, fechaInicio, fechaFin]);

  useEffect(() => {
    if (!isAuthenticated || !authUserId) {
      return;
    }

    cargarHistorialAhorro();
  }, [isAuthenticated, authUserId, categorias, fechaAhorroInicio, fechaAhorroFin]);

  useEffect(() => {
    if (!isAuthenticated || !authUserId) {
      return;
    }

    const deudaGuardada = localStorage.getItem(getScopedStorageKey(DEUDA_INICIAL_TARJETA_KEY, authUserId));
    const limiteGuardado = localStorage.getItem(getScopedStorageKey(LIMITE_TARJETA_KEY, authUserId));
    const presupuestoGuardado = localStorage.getItem(getScopedStorageKey(PRESUPUESTO_INGRESO_BASE_KEY, authUserId));
    const movimientosTarjetaGuardados = localStorage.getItem(getScopedStorageKey(MOVIMIENTOS_TARJETA_KEY, authUserId));

    setDeudaInicialTarjeta(deudaGuardada ?? '1.997.217');
    setLimiteTarjeta(limiteGuardado ?? '2.200.000');
    setPresupuestoIngresoBase(presupuestoGuardado ?? '');

    if (!movimientosTarjetaGuardados) {
      setMovimientosTarjeta([]);
      return;
    }

    try {
      const parsed = JSON.parse(movimientosTarjetaGuardados) as MovimientoTarjeta[];
      setMovimientosTarjeta(Array.isArray(parsed) ? parsed : []);
    } catch {
      setMovimientosTarjeta([]);
    }
  }, [isAuthenticated, authUserId]);

  useEffect(() => {
    if (!isAuthenticated || !authUserId) {
      return;
    }

    localStorage.setItem(getScopedStorageKey(DEUDA_INICIAL_TARJETA_KEY, authUserId), deudaInicialTarjeta);
  }, [isAuthenticated, authUserId, deudaInicialTarjeta]);

  useEffect(() => {
    if (!isAuthenticated || !authUserId) {
      return;
    }

    localStorage.setItem(getScopedStorageKey(LIMITE_TARJETA_KEY, authUserId), limiteTarjeta);
  }, [isAuthenticated, authUserId, limiteTarjeta]);

  useEffect(() => {
    if (!isAuthenticated || !authUserId) {
      return;
    }

    localStorage.setItem(getScopedStorageKey(MOVIMIENTOS_TARJETA_KEY, authUserId), JSON.stringify(movimientosTarjeta));
  }, [isAuthenticated, authUserId, movimientosTarjeta]);

  useEffect(() => {
    if (!isAuthenticated || !authUserId) {
      return;
    }

    localStorage.setItem(getScopedStorageKey(PRESUPUESTO_INGRESO_BASE_KEY, authUserId), presupuestoIngresoBase);
  }, [isAuthenticated, authUserId, presupuestoIngresoBase]);

  function obtenerMensajeErrorLogin(error: {
    message: string;
    details?: string;
    hint?: string;
    code?: string;
  }) {
    const textoError = [error.message, error.details, error.hint, error.code]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (error.code === 'PGRST202' || textoError.includes(LOGIN_RPC)) {
      return 'Falta crear login multiusuario en DB. Ejecuta sql/setup_multiusuario_y_mensualidad.sql en Supabase.';
    }

    if (textoError.includes('permission denied') || textoError.includes('not allowed')) {
      return 'Error de permisos en DB. Re-ejecuta sql/setup_fin_usuarios.sql.';
    }

    return `No se pudo iniciar sesión: ${error.message}`;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    const { data, error } = await supabase.rpc(LOGIN_RPC, {
      p_usuario: loginUser,
      p_password: loginPassword,
      p_clave_mensual: loginMonthlyKey,
    });

    if (error) {
      setLoginError(obtenerMensajeErrorLogin(error));
      setLoginLoading(false);
      return;
    }

    const payload = (Array.isArray(data) ? data[0] : data) as LoginRpcResponse | null;

    if (payload?.ok && payload.user_id) {
      const sessionData: AuthSession = {
        ok: true,
        userId: payload.user_id,
        usuario: payload.usuario ?? loginUser,
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
      setAuthSession(sessionData);
      setIsAuthenticated(true);
      setLoginError('');
      setLoginPassword('');
      setLoginMonthlyKey('');
      setLoginLoading(false);
      return;
    }

    setLoginError(payload?.mensaje || 'Usuario, contraseña o clave mensual incorrectos.');
    setLoginLoading(false);
  }

  function handleLogout() {
    sessionStorage.removeItem(SESSION_KEY);
    setAuthSession(null);
    setIsAuthenticated(false);
    setMovimientos([]);
    setHistorialAhorro([]);
    setMovimientosTarjeta([]);
    setLoginUser('');
    setLoginPassword('');
    setLoginMonthlyKey('');
    setLoginError('');
  }

  function mostrarErrorSupabase(errorMessage: string) {
    if (errorMessage.includes(`Could not find the table 'public.${MOVIMIENTOS_TABLE}'`)) {
      alert(`Falta crear la tabla ${MOVIMIENTOS_TABLE} en Supabase. Ejecuta el script SQL que te dejé en sql/setup_fin_movimientos.sql y vuelve a intentar.`);
      return;
    }

    const texto = errorMessage.toLowerCase();
    if (texto.includes('usuario_id') || texto.includes('fin_login_multi')) {
      alert('Falta migración multiusuario. Ejecuta sql/setup_multiusuario_y_mensualidad.sql y vuelve a intentar.');
      return;
    }

    alert('Error: ' + errorMessage);
  }

  async function cargarCategorias() {
    const { data } = await supabase.from('fin_categorias').select('*');
    if (data) {
      setCategorias(data);
      if (data.length > 0) setCategoriaId(data[0].id);
    }
  }

  function obtenerCategoriaAhorro() {
    return categorias.find(
      (categoria) => categoria.icono === 'SAVINGS' || categoria.nombre.toLowerCase().includes('ahorro'),
    );
  }

  async function cargarMovimientos() {
    if (!authUserId) {
      setMovimientos([]);
      return;
    }

    const { data, error } = await supabase
      .from(MOVIMIENTOS_TABLE)
      .select('*, categorias:fin_categorias(*)')
      .eq('usuario_id', authUserId)
      .gte('fecha', fechaInicio)
      .lte('fecha', fechaFin)
      .order('fecha', { ascending: false });

    if (error) {
      mostrarErrorSupabase(error.message);
      return;
    }

    if (data) setMovimientos(data);
  }

  async function cargarHistorialAhorro() {
    if (!authUserId) {
      setHistorialAhorro([]);
      return;
    }

    const categoriaAhorro = obtenerCategoriaAhorro();

    if (!categoriaAhorro) {
      setHistorialAhorro([]);
      return;
    }

    const { data, error } = await supabase
      .from(MOVIMIENTOS_TABLE)
      .select('*, categorias:fin_categorias(*)')
      .eq('usuario_id', authUserId)
      .eq('categoria_id', categoriaAhorro.id)
      .gte('fecha', fechaAhorroInicio)
      .lte('fecha', fechaAhorroFin)
      .order('fecha', { ascending: false });

    if (error) {
      mostrarErrorSupabase(error.message);
      return;
    }

    setHistorialAhorro(data ?? []);
  }

  async function guardarMovimiento(e: React.FormEvent) {
    e.preventDefault();
    if (!authUserId) {
      alert('Sesión inválida. Vuelve a iniciar sesión.');
      return;
    }

    const montoNormalizado = parseGsInputToNumber(monto);
    if (!monto || Number.isNaN(montoNormalizado) || montoNormalizado <= 0) {
      return alert('El monto debe ser mayor a 0');
    }

    const { error } = await supabase.from(MOVIMIENTOS_TABLE).insert([{
      monto: montoNormalizado,
      descripcion,
      tipo,
      categoria_id: categoriaId,
      fecha,
      usuario_id: authUserId,
    }]);

    if (error) {
      mostrarErrorSupabase(error.message);
    } else {
      setMonto('');
      setDescripcion('');
      setMostrarModalMovimiento(false);
      cargarMovimientos();
      cargarHistorialAhorro();
    }
  }

  async function guardarAhorro(e: React.FormEvent) {
    e.preventDefault();

    if (!authUserId) {
      alert('Sesión inválida. Vuelve a iniciar sesión.');
      return;
    }

    const categoriaAhorro = obtenerCategoriaAhorro();

    if (!categoriaAhorro) {
      alert('No se encontró la categoría Ahorro. Verifica fin_categorias.');
      return;
    }

    const montoNormalizado = parseGsInputToNumber(ahorroMonto);
    if (!ahorroMonto || Number.isNaN(montoNormalizado) || montoNormalizado <= 0) {
      alert('El monto de ahorro debe ser mayor a 0');
      return;
    }

    const { error } = await supabase.from(MOVIMIENTOS_TABLE).insert([
      {
        monto: montoNormalizado,
        descripcion: ahorroDescripcion.trim() || (ahorroOperacion === 'AHORRO' ? 'Ahorro' : 'Retiro de ahorro'),
        tipo: ahorroOperacion === 'AHORRO' ? 'INGRESO' : 'GASTO',
        categoria_id: categoriaAhorro.id,
        fecha: ahorroFecha,
        usuario_id: authUserId,
      },
    ]);

    if (error) {
      mostrarErrorSupabase(error.message);
      return;
    }

    setAhorroMonto('');
    setAhorroDescripcion(ahorroOperacion === 'AHORRO' ? 'Ahorro' : 'Retiro de ahorro');
    setAhorroFecha(format(new Date(), 'yyyy-MM-dd'));
    cargarMovimientos();
    cargarHistorialAhorro();
  }

  async function eliminarMovimiento(id: string) {
    if (!authUserId) {
      alert('Sesión inválida. Vuelve a iniciar sesión.');
      return;
    }

    if (confirm('¿Seguro de eliminar este registro?')) {
      const { error } = await supabase
        .from(MOVIMIENTOS_TABLE)
        .delete()
        .eq('id', id)
        .eq('usuario_id', authUserId);
      if (error) {
        mostrarErrorSupabase(error.message);
        return;
      }
      cargarMovimientos();
      cargarHistorialAhorro();
    }
  }

  async function moverMovimientoAAhorro(movimiento: Movimiento) {
    if (!authUserId) {
      alert('Sesión inválida. Vuelve a iniciar sesión.');
      return;
    }

    const categoriaAhorro = obtenerCategoriaAhorro();

    if (!categoriaAhorro) {
      alert('No se encontró la categoría Ahorro. Verifica fin_categorias.');
      return;
    }

    const confirmar = confirm(
      `¿Mover "${movimiento.descripcion}" a Ahorro como DEPÓSITO?`,
    );

    if (!confirmar) {
      return;
    }

    const { error } = await supabase
      .from(MOVIMIENTOS_TABLE)
      .update({
        categoria_id: categoriaAhorro.id,
        tipo: 'INGRESO',
      })
      .eq('id', movimiento.id)
      .eq('usuario_id', authUserId);

    if (error) {
      mostrarErrorSupabase(error.message);
      return;
    }

    cargarMovimientos();
    cargarHistorialAhorro();
  }

  function guardarMovimientoTarjeta(e: React.FormEvent) {
    e.preventDefault();

    const montoNormalizado = parseGsInputToNumber(tarjetaMonto);
    if (!tarjetaMonto || Number.isNaN(montoNormalizado) || montoNormalizado <= 0) {
      alert('El monto de tarjeta debe ser mayor a 0');
      return;
    }

    const nuevo: MovimientoTarjeta = {
      id: crypto.randomUUID(),
      tipo: tarjetaTipo,
      monto: montoNormalizado,
      descripcion: tarjetaDescripcion.trim() || (tarjetaTipo === 'GASTO' ? 'Consumo de tarjeta' : 'Pago de tarjeta'),
      fecha: tarjetaFecha,
    };

    setMovimientosTarjeta((prev) => [nuevo, ...prev]);
    setTarjetaMonto('');
    setTarjetaDescripcion('');
    setTarjetaFecha(format(new Date(), 'yyyy-MM-dd'));
  }

  function eliminarMovimientoTarjeta(id: string) {
    if (!confirm('¿Eliminar este movimiento de tarjeta?')) {
      return;
    }

    setMovimientosTarjeta((prev) => prev.filter((mov) => mov.id !== id));
  }

  const categoriaAhorro = obtenerCategoriaAhorro();
  const movimientosNoAhorro = movimientos.filter(
    (mov) => !categoriaAhorro || mov.categoria_id !== categoriaAhorro.id,
  );

  const ingresos = movimientosNoAhorro.filter(m => m.tipo === 'INGRESO').reduce((acc, curr) => acc + curr.monto, 0);
  const gastos = movimientosNoAhorro.filter(m => m.tipo === 'GASTO').reduce((acc, curr) => acc + curr.monto, 0);
  const balance = ingresos - gastos;
  const depositosAhorro = historialAhorro
    .filter((mov) => mov.tipo === 'INGRESO')
    .reduce((acumulado, mov) => acumulado + mov.monto, 0);
  const retirosAhorro = historialAhorro
    .filter((mov) => mov.tipo === 'GASTO')
    .reduce((acumulado, mov) => acumulado + mov.monto, 0);
  const gastosTotalesConAhorro = gastos + depositosAhorro;
  const ahorroAcumulado = historialAhorro.reduce((acumulado, mov) => {
    if (mov.tipo === 'INGRESO') {
      return acumulado + mov.monto;
    }
    return acumulado - mov.monto;
  }, 0);
  const saldoDisponible = balance - ahorroAcumulado;
  const deudaBaseTarjetaNumero = deudaInicialTarjeta ? parseGsInputToNumber(deudaInicialTarjeta) : 0;
  const limiteTarjetaNumero = limiteTarjeta ? parseGsInputToNumber(limiteTarjeta) : 0;
  const gastosTarjeta = movimientosTarjeta
    .filter((mov) => mov.tipo === 'GASTO')
    .reduce((acc, mov) => acc + mov.monto, 0);
  const pagosTarjeta = movimientosTarjeta
    .filter((mov) => mov.tipo === 'PAGO')
    .reduce((acc, mov) => acc + mov.monto, 0);
  const deudaTarjetaNumero = Math.max(0, deudaBaseTarjetaNumero + gastosTarjeta - pagosTarjeta);
  const disponibleTarjeta = Math.max(0, limiteTarjetaNumero - deudaTarjetaNumero);
  const netoDespuesDeuda = saldoDisponible - deudaTarjetaNumero;
  const faltanteTarjeta = Math.max(0, deudaTarjetaNumero - saldoDisponible);

  const ingresoBasePresupuestoNumero = presupuestoIngresoBase
    ? parseGsInputToNumber(presupuestoIngresoBase)
    : 0;
  const ingresoReferenciaPresupuesto = ingresoBasePresupuestoNumero > 0
    ? ingresoBasePresupuestoNumero
    : Math.max(ingresos, 0);
  const presupuestoGastosSugeridoTotal = ingresoReferenciaPresupuesto * 0.8;
  const presupuestoAhorroSugerido = ingresoReferenciaPresupuesto * 0.2;

  const categoriasPresupuesto = useMemo(() => {
    const base = categorias.filter(
      (categoria) => categoria.icono !== 'ATTACH_MONEY' && categoria.icono !== 'SAVINGS',
    );

    if (base.length > 0) {
      return base;
    }

    const idsUnicos = Array.from(new Set(movimientosNoAhorro.map((mov) => mov.categoria_id)));
    return idsUnicos.map((id) => {
      const nombre = movimientosNoAhorro.find((mov) => mov.categoria_id === id)?.categorias?.nombre ?? 'Categoría';
      return { id, nombre, icono: '' };
    });
  }, [categorias, movimientosNoAhorro]);

  const presupuestoPorCategoria = useMemo(() => {
    const gastoRealTotal = movimientosNoAhorro
      .filter((mov) => mov.tipo === 'GASTO')
      .reduce((acc, mov) => acc + mov.monto, 0);

    const cantidadCategorias = categoriasPresupuesto.length || 1;

    return categoriasPresupuesto.map((categoria) => {
      const gastoActual = movimientosNoAhorro
        .filter((mov) => mov.tipo === 'GASTO' && mov.categoria_id === categoria.id)
        .reduce((acc, mov) => acc + mov.monto, 0);

      const proporcion = gastoRealTotal > 0 ? gastoActual / gastoRealTotal : 1 / cantidadCategorias;
      const recomendado = presupuestoGastosSugeridoTotal * proporcion;
      const estado = recomendado <= 0
        ? 'OK'
        : gastoActual > recomendado * 1.1
          ? 'ALTO'
          : gastoActual > recomendado * 0.9
            ? 'ATENCION'
            : 'OK';

      return { categoria, gastoActual, recomendado, estado };
    });
  }, [categoriasPresupuesto, movimientosNoAhorro, presupuestoGastosSugeridoTotal]);

  const movimientosTarjetaMes = movimientosTarjeta.filter((mov) => mov.fecha.startsWith(mesTarjeta));
  const gastosTarjetaMes = movimientosTarjetaMes
    .filter((mov) => mov.tipo === 'GASTO')
    .reduce((acc, mov) => acc + mov.monto, 0);
  const pagosTarjetaMes = movimientosTarjetaMes
    .filter((mov) => mov.tipo === 'PAGO')
    .reduce((acc, mov) => acc + mov.monto, 0);
  const variacionTarjetaMes = gastosTarjetaMes - pagosTarjetaMes;
  const movimientosFiltrados = movimientosNoAhorro.filter((mov) => {
    const coincideTipo = filtroTipoHistorial === 'TODOS' || mov.tipo === filtroTipoHistorial;
    const texto = busquedaHistorial.trim().toLowerCase();
    const coincideTexto =
      texto.length === 0 ||
      mov.descripcion.toLowerCase().includes(texto) ||
      (mov.categorias?.nombre ?? '').toLowerCase().includes(texto);

    return coincideTipo && coincideTexto;
  });

  function aplicarEsteMes() {
    setFechaInicio(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    setFechaFin(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  }

  function aplicarQuincena() {
    setFechaInicio(format(subDays(new Date(), 14), 'yyyy-MM-dd'));
    setFechaFin(format(new Date(), 'yyyy-MM-dd'));
  }

  function aplicarTodoHistorial() {
    setFechaInicio('2000-01-01');
    setFechaFin(format(new Date(), 'yyyy-MM-dd'));
  }

  function aplicarTodoHistorialAhorro() {
    setFechaAhorroInicio('2000-01-01');
    setFechaAhorroFin(format(new Date(), 'yyyy-MM-dd'));
  }

  function cerrarMesTarjeta() {
    setResumenCierreMes({
      mes: mesTarjeta,
      gastos: gastosTarjetaMes,
      pagos: pagosTarjetaMes,
      variacion: variacionTarjetaMes,
    });
  }

  async function exportarBackup() {
    if (!authUserId) {
      alert('Sesión inválida. Vuelve a iniciar sesión.');
      return;
    }

    const { data: categoriasData, error: categoriasError } = await supabase
      .from('fin_categorias')
      .select('id, nombre, icono')
      .order('id', { ascending: true });

    if (categoriasError) {
      mostrarErrorSupabase(categoriasError.message);
      return;
    }

    const { data: movimientosData, error: movimientosError } = await supabase
      .from(MOVIMIENTOS_TABLE)
      .select('id, monto, descripcion, fecha, tipo, categoria_id, usuario_id')
      .eq('usuario_id', authUserId)
      .order('fecha', { ascending: true });

    if (movimientosError) {
      mostrarErrorSupabase(movimientosError.message);
      return;
    }

    const payload: BackupPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      categorias: categoriasData ?? [],
      movimientos: movimientosData ?? [],
      tarjeta: {
        deudaInicial: deudaInicialTarjeta,
        limite: limiteTarjeta,
        movimientos: movimientosTarjeta,
      },
    };

    const backupJson = JSON.stringify(payload, null, 2);
    const blob = new Blob([backupJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `backup-registro-gastos-${format(new Date(), 'yyyy-MM-dd')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function abrirSelectorImportacion() {
    backupInputRef.current?.click();
  }

  async function importarBackup(event: React.ChangeEvent<HTMLInputElement>) {
    if (!authUserId) {
      alert('Sesión inválida. Vuelve a iniciar sesión.');
      return;
    }

    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const contenido = await file.text();
      const backup = JSON.parse(contenido) as BackupPayload;

      if (!Array.isArray(backup.categorias) || !Array.isArray(backup.movimientos)) {
        alert('Archivo de backup inválido.');
        return;
      }

      const confirmar = confirm('Esto fusionará datos del backup con tu base actual. ¿Continuar?');
      if (!confirmar) {
        return;
      }

      const { error: categoriasError } = await supabase
        .from('fin_categorias')
        .upsert(backup.categorias, { onConflict: 'id' });

      if (categoriasError) {
        mostrarErrorSupabase(categoriasError.message);
        return;
      }

      const movimientosConUsuario = backup.movimientos.map((mov) => ({
        ...mov,
        usuario_id: authUserId,
      }));

      const { error: movimientosError } = await supabase
        .from(MOVIMIENTOS_TABLE)
        .upsert(movimientosConUsuario, { onConflict: 'id' });

      if (movimientosError) {
        mostrarErrorSupabase(movimientosError.message);
        return;
      }

      if (backup.tarjeta) {
        setDeudaInicialTarjeta(backup.tarjeta.deudaInicial || deudaInicialTarjeta);
        setLimiteTarjeta(backup.tarjeta.limite || limiteTarjeta);
        if (Array.isArray(backup.tarjeta.movimientos)) {
          setMovimientosTarjeta(backup.tarjeta.movimientos);
        }
      }

      await cargarCategorias();
      await cargarMovimientos();
      await cargarHistorialAhorro();
      alert('Backup importado correctamente.');
    } catch {
      alert('No se pudo leer el backup. Verifica que sea un JSON válido.');
    } finally {
      event.target.value = '';
    }
  }

  const handlePrint = () => {
    window.print();
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center">
              <ShieldCheck size={24} />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 text-center">Registro de Gastos</h1>
          <p className="text-sm text-gray-500 text-center mt-1 mb-5">Inicia sesión para continuar</p>

          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Usuario</label>
              <input
                type="text"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Admin"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Contraseña</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Clave mensual</label>
              <input
                type="password"
                value={loginMonthlyKey}
                onChange={(e) => setLoginMonthlyKey(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Clave de pago vigente"
                autoComplete="one-time-code"
              />
            </div>

            {loginError && <p className="text-sm text-red-600">{loginError}</p>}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition font-medium"
            >
              {loginLoading ? 'Validando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-4 md:p-6 space-y-6">
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Control de Gastos</h1>
          <div className="text-xs sm:text-sm text-gray-500 mt-1">Sesión: {authUsuario}</div>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            onClick={exportarBackup}
            className="bg-slate-100 text-slate-800 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-200 transition text-sm"
            title="Exportar backup"
          >
            <Download size={16} />
            Exportar
          </button>
          <button
            onClick={abrirSelectorImportacion}
            className="bg-slate-100 text-slate-800 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-200 transition text-sm"
            title="Importar backup"
          >
            <Upload size={16} />
            Importar
          </button>
          <button 
            onClick={handlePrint}
            className="bg-gray-800 text-white px-3 sm:px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-700 transition text-sm"
          >
            <Printer size={18} />
            <span className="hidden sm:inline">Imprimir</span>
          </button>
          <button
            onClick={handleLogout}
            className="bg-red-50 text-red-700 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-red-100 transition text-sm"
            title="Cerrar sesión"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Salir</span>
          </button>
          <input
            ref={backupInputRef}
            type="file"
            accept="application/json"
            onChange={importarBackup}
            className="hidden"
          />
        </div>
      </header>

      <div className="no-print bg-white p-2 rounded-xl border border-gray-100 shadow-sm flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setVistaActiva('MOVIMIENTOS')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition flex-1 sm:flex-none ${vistaActiva === 'MOVIMIENTOS' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          Gastos e Ingresos
        </button>
        <button
          type="button"
          onClick={() => setVistaActiva('AHORRO')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition flex-1 sm:flex-none ${vistaActiva === 'AHORRO' ? 'bg-sky-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          Ahorro
        </button>
        <button
          type="button"
          onClick={() => setVistaActiva('TARJETA')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition flex-1 sm:flex-none ${vistaActiva === 'TARJETA' ? 'bg-violet-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          Tarjeta
        </button>
      </div>

      {vistaActiva === 'MOVIMIENTOS' && (
        <>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <div className="text-sm text-gray-500">Disponible hoy (para comparar con banco)</div>
            <div className="text-4xl font-bold text-blue-700 mt-1">{formatGsNoDecimals(saldoDisponible)}</div>
            <div className="text-xs text-gray-500 mt-2">Este valor ya descuenta tu ahorro neto.</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <div className="text-gray-500 text-sm mb-1">Ingresos Totales</div>
              <div className="text-2xl font-semibold text-emerald-600">
                {formatGs(ingresos)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <div className="text-gray-500 text-sm mb-1">Gastos Totales (incluye ahorro)</div>
              <div className="text-2xl font-semibold text-red-500">
                {formatGs(gastosTotalesConAhorro)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Sin ahorro: {formatGs(gastos)}</div>
            </div>
            <div className={`p-4 rounded-xl shadow-sm border ${balance >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <div className="text-gray-600 text-sm mb-1">Balance Final</div>
              <div className={`text-2xl font-bold ${balance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {formatGs(balance)}
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 no-print">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Presupuesto sugerido</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMostrarPresupuesto((prev) => !prev)}
                  className="px-3 py-2 rounded border border-gray-200 hover:bg-gray-50 text-sm"
                >
                  {mostrarPresupuesto ? 'Ocultar' : 'Mostrar'}
                </button>
                <label className="text-sm text-gray-600">Ingreso base</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={presupuestoIngresoBase}
                  onChange={(e) => setPresupuestoIngresoBase(formatGsInputFromDigits(e.target.value))}
                  className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-40"
                  placeholder={formatGsNoDecimals(ingresos)}
                />
                <button
                  type="button"
                  onClick={() => setPresupuestoIngresoBase('')}
                  className="px-3 py-2 rounded border border-gray-200 hover:bg-gray-50 text-sm"
                >
                  Auto
                </button>
              </div>

            </div>

              {mostrarPresupuesto && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3 mt-3">
                    <div className="rounded-lg border border-gray-100 p-3 bg-gray-50">
                      <div className="text-sm text-gray-600">Gasto sugerido total (80%)</div>
                      <div className="text-xl font-semibold text-blue-700">{formatGsNoDecimals(presupuestoGastosSugeridoTotal)}</div>
                    </div>
                    <div className="rounded-lg border border-gray-100 p-3 bg-gray-50">
                      <div className="text-sm text-gray-600">Ahorro sugerido (20%)</div>
                      <div className="text-xl font-semibold text-sky-700">{formatGsNoDecimals(presupuestoAhorroSugerido)}</div>
                    </div>
                  </div>

                  <div className="divide-y divide-gray-100 border rounded-lg overflow-hidden">
                    {presupuestoPorCategoria.map((item) => (
                      <div key={`presupuesto-${item.categoria.id}`} className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <div className="font-medium text-gray-800">{item.categoria.nombre}</div>
                          <div className="text-xs text-gray-500">Actual: {formatGsNoDecimals(item.gastoActual)} · Sugerido: {formatGsNoDecimals(item.recomendado)}</div>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${item.estado === 'ALTO' ? 'bg-red-100 text-red-700' : item.estado === 'ATENCION' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {item.estado === 'ALTO' ? 'Alto' : item.estado === 'ATENCION' ? 'Atención' : 'OK'}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {!mostrarPresupuesto && (
                <div className="mt-3 text-sm text-gray-500">Presupuesto oculto para simplificar la vista. Toca “Mostrar”.</div>
              )}
            </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="hidden lg:col-span-1 bg-white p-5 rounded-xl shadow-sm border border-gray-100 no-print">
              <h2 className="text-lg font-semibold mb-4">Nuevo Registro</h2>
              <form onSubmit={guardarMovimiento} className="space-y-4">
                <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                  <button
                    type="button"
                    className={`flex-1 py-2 text-sm font-medium rounded-md flex justify-center items-center gap-1 transition ${tipo === 'GASTO' ? 'bg-white shadow text-red-600' : 'text-gray-500'}`}
                    onClick={() => setTipo('GASTO')}
                  >
                    <MinusCircle size={16} /> Gasto
                  </button>
                  <button
                    type="button"
                    className={`flex-1 py-2 text-sm font-medium rounded-md flex justify-center items-center gap-1 transition ${tipo === 'INGRESO' ? 'bg-white shadow text-emerald-600' : 'text-gray-500'}`}
                    onClick={() => setTipo('INGRESO')}
                  >
                    <PlusCircle size={16} /> Ingreso
                  </button>
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">Monto (Gs)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={monto}
                    onChange={e => setMonto(formatGsInputFromDigits(e.target.value))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="0,00"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">Descripción</label>
                  <input
                    type="text"
                    required
                    value={descripcion}
                    onChange={e => setDescripcion(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Ej. Compra súper"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">Categoría</label>
                  <select
                    value={categoriaId}
                    onChange={e => setCategoriaId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  >
                    {categorias.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">Fecha</label>
                  <input
                    type="date"
                    required
                    value={fecha}
                    onChange={e => setFecha(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition font-medium"
                >
                  Guardar {tipo === 'GASTO' ? 'Gasto' : 'Ingreso'}
                </button>
              </form>
            </div>

            <div className="lg:col-span-3 space-y-4">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap gap-4 items-center justify-between">
                <h2 className="text-lg font-semibold">Historial</h2>
                <button
                  type="button"
                  onClick={() => setMostrarHistorialDetalle((prev) => !prev)}
                  className="px-3 py-2 rounded border border-gray-200 hover:bg-gray-50 text-sm"
                >
                  {mostrarHistorialDetalle ? 'Ocultar filtros' : 'Mostrar filtros'}
                </button>

                {mostrarHistorialDetalle && (
                  <>
                    <div className="w-full mobile-scroll-x">
                      <div className="inline-flex items-center gap-2 text-sm min-w-max pr-1">
                        <input 
                          type="date" 
                          value={fechaInicio} 
                          onChange={e => setFechaInicio(e.target.value)}
                          className="border px-2 py-1 rounded"
                        />
                        <span>a</span>
                        <input 
                          type="date" 
                          value={fechaFin} 
                          onChange={e => setFechaFin(e.target.value)}
                          className="border px-2 py-1 rounded"
                        />
                        <button
                          type="button"
                          onClick={aplicarQuincena}
                          className="px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
                        >
                          Últimos 15 días
                        </button>
                        <button
                          type="button"
                          onClick={aplicarEsteMes}
                          className="px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
                        >
                          Este mes
                        </button>
                        <button
                          type="button"
                          onClick={aplicarTodoHistorial}
                          className="px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
                        >
                          Todo
                        </button>
                      </div>
                    </div>

                    <div className="w-full flex flex-col md:flex-row gap-2 md:items-center">
                      <input
                        type="text"
                        value={busquedaHistorial}
                        onChange={(e) => setBusquedaHistorial(e.target.value)}
                        placeholder="Buscar por descripción o categoría"
                        className="w-full md:max-w-sm border px-3 py-2 rounded-lg"
                      />
                      <div className="mobile-scroll-x">
                        <div className="inline-flex gap-2 min-w-max">
                          <button
                            type="button"
                            onClick={() => setFiltroTipoHistorial('TODOS')}
                            className={`px-3 py-2 rounded-lg border ${filtroTipoHistorial === 'TODOS' ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 hover:bg-gray-50'}`}
                          >
                            Todos
                          </button>
                          <button
                            type="button"
                            onClick={() => setFiltroTipoHistorial('GASTO')}
                            className={`px-3 py-2 rounded-lg border ${filtroTipoHistorial === 'GASTO' ? 'bg-red-600 text-white border-red-600' : 'border-gray-200 hover:bg-gray-50'}`}
                          >
                            Gastos
                          </button>
                          <button
                            type="button"
                            onClick={() => setFiltroTipoHistorial('INGRESO')}
                            className={`px-3 py-2 rounded-lg border ${filtroTipoHistorial === 'INGRESO' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-200 hover:bg-gray-50'}`}
                          >
                            Ingresos
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {!mostrarHistorialDetalle && (
                  <div className="w-full text-sm text-gray-500">Filtros ocultos para vista rápida. Toca “Mostrar filtros”.</div>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden print:border-none print:shadow-none">
                {movimientosFiltrados.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    No hay movimientos en este periodo
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {movimientosFiltrados.map(mov => {
                      const Icon = mov.categorias ? (iconMap[mov.categorias.icono] || <HelpCircle className="w-5 h-5" />) : <HelpCircle className="w-5 h-5" />;

                      return (
                        <div key={mov.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:hover:bg-gray-50 transition">
                          <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                            <div className={`p-2 rounded-full bg-gray-100`}>
                              {Icon}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-800 break-words">{mov.descripcion}</p>
                              <div className="flex flex-wrap gap-2 text-xs text-gray-500 mt-0.5">
                                <span>{format(new Date(mov.fecha + 'T00:00:00'), 'dd MMM yyyy')}</span>
                                <span>•</span>
                                <span>{mov.categorias?.nombre || 'Sin categoría'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="w-full sm:w-auto flex items-center justify-end gap-4">
                            <span className={`font-semibold ${mov.tipo === 'INGRESO' ? 'text-emerald-600' : 'text-gray-800'}`}>
                              {mov.tipo === 'INGRESO' ? '+' : '-'}{formatGs(mov.monto)}
                            </span>
                            <button
                              onClick={() => moverMovimientoAAhorro(mov)}
                              className="text-gray-400 hover:text-sky-600 p-1 no-print"
                              title="Mover a ahorro"
                            >
                              <PiggyBank size={16} />
                            </button>
                            <button
                              onClick={() => eliminarMovimiento(mov.id)}
                              className="text-gray-400 hover:text-red-500 p-1 no-print"
                              title="Eliminar"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMostrarModalMovimiento(true)}
            className="no-print fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-4 sm:right-6 z-40 w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 flex items-center justify-center"
            title="Agregar movimiento"
          >
            <PlusCircle size={26} />
          </button>

          {mostrarModalMovimiento && (
            <div className="no-print fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
              <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-4 sm:p-5 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Nuevo Registro</h3>
                  <button
                    type="button"
                    onClick={() => setMostrarModalMovimiento(false)}
                    className="text-gray-500 hover:text-gray-700"
                    title="Cerrar"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={guardarMovimiento} className="space-y-4">
                  <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                    <button
                      type="button"
                      className={`flex-1 py-2 text-sm font-medium rounded-md flex justify-center items-center gap-1 transition ${tipo === 'GASTO' ? 'bg-white shadow text-red-600' : 'text-gray-500'}`}
                      onClick={() => setTipo('GASTO')}
                    >
                      <MinusCircle size={16} /> Gasto
                    </button>
                    <button
                      type="button"
                      className={`flex-1 py-2 text-sm font-medium rounded-md flex justify-center items-center gap-1 transition ${tipo === 'INGRESO' ? 'bg-white shadow text-emerald-600' : 'text-gray-500'}`}
                      onClick={() => setTipo('INGRESO')}
                    >
                      <PlusCircle size={16} /> Ingreso
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Monto (Gs)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      value={monto}
                      onChange={e => setMonto(formatGsInputFromDigits(e.target.value))}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Descripción</label>
                    <input
                      type="text"
                      required
                      value={descripcion}
                      onChange={e => setDescripcion(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="Ej. Compra súper"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Categoría</label>
                    <select
                      value={categoriaId}
                      onChange={e => setCategoriaId(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    >
                      {categorias.map(c => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Fecha</label>
                    <input
                      type="date"
                      required
                      value={fecha}
                      onChange={e => setFecha(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition font-medium"
                  >
                    Guardar {tipo === 'GASTO' ? 'Gasto' : 'Ingreso'}
                  </button>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {vistaActiva === 'AHORRO' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <div className="text-gray-500 text-sm mb-1">Depósitos de Ahorro</div>
              <div className="text-2xl font-semibold text-sky-700">{formatGs(depositosAhorro)}</div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <div className="text-gray-500 text-sm mb-1">Retiros de Ahorro</div>
              <div className="text-2xl font-semibold text-amber-700">{formatGs(retirosAhorro)}</div>
            </div>
            <div className={`p-4 rounded-xl shadow-sm border ${ahorroAcumulado >= 0 ? 'bg-sky-50 border-sky-100' : 'bg-amber-50 border-amber-100'}`}>
              <div className="text-gray-600 text-sm mb-1">Ahorro Neto</div>
              <div className={`text-2xl font-bold ${ahorroAcumulado >= 0 ? 'text-sky-700' : 'text-amber-700'}`}>
                {formatGs(ahorroAcumulado)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-white p-5 rounded-xl shadow-sm border border-gray-100 no-print">
              <h3 className="text-base font-semibold mb-3 text-sky-800">Cargar Ahorro</h3>
              <form onSubmit={guardarAhorro} className="space-y-3">
                <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                  <button
                    type="button"
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition ${ahorroOperacion === 'AHORRO' ? 'bg-white shadow text-sky-700' : 'text-gray-500'}`}
                    onClick={() => {
                      setAhorroOperacion('AHORRO');
                      setAhorroDescripcion('Ahorro');
                    }}
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition ${ahorroOperacion === 'RETIRO' ? 'bg-white shadow text-amber-700' : 'text-gray-500'}`}
                    onClick={() => {
                      setAhorroOperacion('RETIRO');
                      setAhorroDescripcion('Retiro de ahorro');
                    }}
                  >
                    Retirar
                  </button>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Monto de ahorro (Gs)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={ahorroMonto}
                    onChange={(e) => setAhorroMonto(formatGsInputFromDigits(e.target.value))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Descripción</label>
                  <input
                    type="text"
                    value={ahorroDescripcion}
                    onChange={(e) => setAhorroDescripcion(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Fecha</label>
                  <input
                    type="date"
                    required
                    value={ahorroFecha}
                    onChange={(e) => setAhorroFecha(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className={`w-full text-white py-2.5 rounded-lg transition font-medium ${ahorroOperacion === 'AHORRO' ? 'bg-sky-600 hover:bg-sky-700' : 'bg-amber-600 hover:bg-amber-700'}`}
                >
                  {ahorroOperacion === 'AHORRO' ? 'Guardar Ahorro' : 'Registrar Retiro de Ahorro'}
                </button>
              </form>
            </div>

            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden no-print">
              <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-sky-800">Historial de Ahorro</h3>
                <div className="w-full mobile-scroll-x">
                  <div className="inline-flex items-center gap-2 text-sm min-w-max pr-1">
                    <input
                      type="date"
                      value={fechaAhorroInicio}
                      onChange={(e) => setFechaAhorroInicio(e.target.value)}
                      className="border px-2 py-1 rounded"
                    />
                    <span>a</span>
                    <input
                      type="date"
                      value={fechaAhorroFin}
                      onChange={(e) => setFechaAhorroFin(e.target.value)}
                      className="border px-2 py-1 rounded"
                    />
                    <button
                      type="button"
                      onClick={aplicarTodoHistorialAhorro}
                      className="px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
                    >
                      Todo ahorro
                    </button>
                  </div>
                </div>
              </div>

              {historialAhorro.length === 0 ? (
                <div className="p-6 text-sm text-gray-500">No hay movimientos de ahorro en este rango.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {historialAhorro.map((mov) => (
                    <div key={`ahorro-${mov.id}`} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-800">{mov.descripcion}</p>
                        <p className="text-xs text-gray-500">{format(new Date(mov.fecha + 'T00:00:00'), 'dd/MM/yyyy')}</p>
                      </div>
                      <div className="w-full sm:w-auto flex items-center justify-end gap-3">
                        <span className={`font-semibold ${mov.tipo === 'INGRESO' ? 'text-sky-700' : 'text-amber-700'}`}>
                          {mov.tipo === 'INGRESO' ? '+' : '-'}{formatGs(mov.monto)}
                        </span>
                        <button
                          onClick={() => eliminarMovimiento(mov.id)}
                          className="text-gray-400 hover:text-red-500 p-1 no-print"
                          title="Eliminar movimiento de ahorro"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {vistaActiva === 'TARJETA' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <div className="text-gray-500 text-sm mb-1">Deuda actual de tarjeta</div>
              <div className="text-2xl font-semibold text-violet-700">{formatGsNoDecimals(deudaTarjetaNumero)}</div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <div className="text-gray-500 text-sm mb-1">Límite disponible en tarjeta</div>
              <div className="text-2xl font-semibold text-blue-700">{formatGsNoDecimals(disponibleTarjeta)}</div>
            </div>
            <div className={`p-4 rounded-xl shadow-sm border ${faltanteTarjeta > 0 ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}`}>
              <div className="text-gray-600 text-sm mb-1">Estado</div>
              <div className={`text-2xl font-bold ${faltanteTarjeta > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                {faltanteTarjeta > 0 ? `Te falta ${formatGsNoDecimals(faltanteTarjeta)}` : `Cubierta (${formatGsNoDecimals(Math.abs(netoDespuesDeuda))})`}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 no-print">
            <div className="lg:col-span-1 bg-white p-5 rounded-xl shadow-sm border border-gray-100 space-y-4">
              <h2 className="text-lg font-semibold">Configuración de tarjeta</h2>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Deuda inicial</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={deudaInicialTarjeta}
                  onChange={(e) => setDeudaInicialTarjeta(formatGsInputFromDigits(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500 outline-none"
                  placeholder="1.997.217"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Límite de tarjeta</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={limiteTarjeta}
                  onChange={(e) => setLimiteTarjeta(formatGsInputFromDigits(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500 outline-none"
                  placeholder="2.200.000"
                />
              </div>

              <div className="border-t pt-4">
                <h3 className="text-base font-semibold mb-3">Registrar movimiento</h3>
                <form onSubmit={guardarMovimientoTarjeta} className="space-y-3">
                  <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                    <button
                      type="button"
                      className={`flex-1 py-2 text-sm font-medium rounded-md transition ${tarjetaTipo === 'GASTO' ? 'bg-white shadow text-red-700' : 'text-gray-500'}`}
                      onClick={() => setTarjetaTipo('GASTO')}
                    >
                      Gasto tarjeta
                    </button>
                    <button
                      type="button"
                      className={`flex-1 py-2 text-sm font-medium rounded-md transition ${tarjetaTipo === 'PAGO' ? 'bg-white shadow text-emerald-700' : 'text-gray-500'}`}
                      onClick={() => setTarjetaTipo('PAGO')}
                    >
                      Pago tarjeta
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Monto</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      value={tarjetaMonto}
                      onChange={(e) => setTarjetaMonto(formatGsInputFromDigits(e.target.value))}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500 outline-none"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Descripción</label>
                    <input
                      type="text"
                      value={tarjetaDescripcion}
                      onChange={(e) => setTarjetaDescripcion(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500 outline-none"
                      placeholder={tarjetaTipo === 'GASTO' ? 'Compra en tarjeta' : 'Pago de resumen'}
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Fecha</label>
                    <input
                      type="date"
                      required
                      value={tarjetaFecha}
                      onChange={(e) => setTarjetaFecha(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500 outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className={`w-full text-white py-2.5 rounded-lg transition font-medium ${tarjetaTipo === 'GASTO' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                  >
                    {tarjetaTipo === 'GASTO' ? 'Guardar gasto en tarjeta' : 'Guardar pago de tarjeta'}
                  </button>
                </form>
              </div>
            </div>

            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-violet-800">Historial de tarjeta</h3>
                <div className="text-sm text-gray-500">Total general · Gastos: {formatGs(gastosTarjeta)} · Pagos: {formatGs(pagosTarjeta)}</div>
                <div className="w-full mobile-scroll-x">
                  <div className="inline-flex items-center gap-2 min-w-max pr-1">
                    <label className="text-sm text-gray-600">Mes:</label>
                    <input
                      type="month"
                      value={mesTarjeta}
                      onChange={(e) => setMesTarjeta(e.target.value)}
                      className="border px-2 py-1 rounded"
                    />
                    <button
                      type="button"
                      onClick={cerrarMesTarjeta}
                      className="px-3 py-1.5 rounded border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
                    >
                      Cerrar mes
                    </button>
                    <div className="text-sm text-gray-500">Mes seleccionado · Gastos: {formatGs(gastosTarjetaMes)} · Pagos: {formatGs(pagosTarjetaMes)}</div>
                  </div>
                </div>
              </div>

              {resumenCierreMes && (
                <div className="mx-4 mt-4 rounded-lg border border-violet-200 bg-violet-50 p-3">
                  <div className="text-sm font-semibold text-violet-800">Cierre de mes {resumenCierreMes.mes}</div>
                  <div className="text-sm text-violet-900 mt-1">
                    Consumo: {formatGs(resumenCierreMes.gastos)} · Pagos: {formatGs(resumenCierreMes.pagos)} · Variación: {formatGs(resumenCierreMes.variacion)}
                  </div>
                </div>
              )}

              {movimientosTarjetaMes.length === 0 ? (
                <div className="p-6 text-sm text-gray-500">Sin movimientos de tarjeta aún.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {movimientosTarjetaMes.map((mov) => (
                    <div key={mov.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-800">{mov.descripcion}</p>
                        <p className="text-xs text-gray-500">{format(new Date(mov.fecha + 'T00:00:00'), 'dd/MM/yyyy')}</p>
                      </div>
                      <div className="w-full sm:w-auto flex items-center justify-end gap-3">
                        <span className={`font-semibold ${mov.tipo === 'GASTO' ? 'text-red-700' : 'text-emerald-700'}`}>
                          {mov.tipo === 'GASTO' ? '+' : '-'}{formatGs(mov.monto)}
                        </span>
                        <button
                          onClick={() => eliminarMovimientoTarjeta(mov.id)}
                          className="text-gray-400 hover:text-red-500 p-1"
                          title="Eliminar movimiento de tarjeta"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

    </div>
  );
}
