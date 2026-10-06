/** Permite que las pruebas importen módulos del navegador que usan rutas absolutas como "/shared/daily.js" o "/games/…". */
import { register } from 'node:module';
register('./resolve-public.mjs', import.meta.url);
