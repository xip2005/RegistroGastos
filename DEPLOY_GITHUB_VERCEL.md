# Deploy sin copiar archivos (GitHub + Vercel)

## 1) Crear variables locales
1. En la raíz del proyecto, crea un archivo `.env`.
2. Copia el contenido de `.env.example` y completa tus datos reales de Supabase:

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_CLAVE_ANON_PUBLICA
```

> Usa **solo** la clave pública (anon/publishable). Nunca la secret key.

## 2) Subir proyecto a GitHub
Desde PowerShell en la carpeta del proyecto:

```powershell
git init
git add .
git commit -m "RegistroGastos listo para deploy"
git branch -M main
```

Luego crea un repo vacío en GitHub (ej: `RegistroGastos`) y ejecuta:

```powershell
git remote add origin https://github.com/TU-USUARIO/RegistroGastos.git
git push -u origin main
```

## 3) Publicar en Vercel
1. Entra a https://vercel.com y conecta tu cuenta de GitHub.
2. Importa el repo `RegistroGastos`.
3. Framework detectado: **Vite** (dejar por defecto).
4. En **Environment Variables**, agrega:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy.

## 4) Uso en cualquier PC/notebook
- Abres la URL de Vercel y listo.
- No necesitas copiar la carpeta del proyecto ni instalar nada.

## 5) Cada vez que actualices la app
En tu PC de trabajo:

```powershell
git add .
git commit -m "tu cambio"
git push
```

Vercel redeploya automáticamente.
