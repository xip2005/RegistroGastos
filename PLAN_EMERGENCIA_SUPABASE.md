# Plan de emergencia si Supabase llega al límite

Este documento es una guía rápida para mantener tu app funcionando sin perder datos.

## Objetivo
- Evitar pérdida de información.
- Restaurar operación en menos de 10 minutos.

## Kit mínimo que ya tienes
- Export/Import JSON dentro de la app.
- Scripts SQL en la carpeta `sql/`.
- Deploy en Vercel.

---

## Protocolo 10 minutos (cuando falle por cuota)

### 1) Congelar y respaldar (2 min)
1. Entra a la app y usa **Exportar backup**.
2. Guarda el archivo como: `backup-YYYY-MM-DD-HHMM.json`.
3. Súbelo a Google Drive (carpeta `RegistroGastos/backups`).

### 2) Identificar el límite (1 min)
En Supabase: **Project → Usage**
- revisa cuál cuota está al tope (Database size, Egress, Storage, etc.).

### 3) Solución rápida de continuidad (1 min)
- Si necesitas seguir operando sin fricción, sube temporalmente de plan.
- Luego optimizas con calma y decides si volver al plan free.

### 4) Plan B si queda bloqueado (6 min)
Si no puedes operar en ese proyecto:

1. Crea un proyecto nuevo en Supabase.
2. Ejecuta scripts en este orden:
   - `sql/setup_fin_movimientos.sql`
   - `sql/setup_fin_usuarios.sql`
   - (si aplica) `sql/fix_ahorro_legado.sql`
3. En Vercel, actualiza variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Redeploy.
5. En la app, usa **Importar backup** para restaurar datos.

---

## Checklist semanal (prevención)
- Hacer 1 backup JSON semanal.
- Guardar backup en Drive + 1 copia local.
- Revisar Usage de Supabase 1 vez por semana.
- Mantener solo la clave pública en frontend (nunca secret key).

## Checklist mensual (resiliencia)
- Probar restauración con un backup reciente (entorno de prueba o momento controlado).
- Confirmar que scripts SQL siguen disponibles y actualizados.
- Verificar variables en Vercel.

---

## Señales típicas de que pegaste límite
- Errores al guardar movimientos.
- Cargas que quedan vacías o lentas.
- Mensajes de cuota/usage en panel Supabase.

Si ocurre, sigue el protocolo de arriba sin improvisar.
