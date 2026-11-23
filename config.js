/* ==========================================================================
   config.js — conexión de Zuma con Supabase y Cloudflare R2.

   La URL y la clave publicable de Supabase están pensadas para el navegador.
   Las credenciales de R2 se usan para firmar subidas desde esta app estática:
   quedan visibles en el código. Para producción hay que moverlas a un Worker
   o Edge Function y rotarlas. No pongas acá la service_role de Supabase.
   ========================================================================== */
window.NIMBOOK_CONFIG = {
  supabaseUrl: 'https://jnewregdsxppdzfdvsqb.supabase.co',
  supabaseKey: 'sb_publishable_9d8K0f5M894ijPc49OznyQ_OeubQgYQ',
  storageBucket: 'zuma-media',
  /* Cloudflare R2: solo para videos. La URL pública es de lectura.
     En una app estática la firma se genera en el navegador; para producción
     conviene mover estas credenciales a un Worker/Edge Function. */
  r2: {
    endpoint: 'https://986f1af76d5f67fb483327411acf4695.r2.cloudflarestorage.com',
    bucket: 'zuma-videos',
    publicUrl: 'https://pub-abcf322bc76e41ddb3bb3ccafc6164aa.r2.dev',
    region: 'auto',
    accessKeyId: 'bf98bc6255a0cd4959a8fc2d7e93ab41',
    secretAccessKey: '9d10c09c293a52872eaf2c9ef20c7ee11ed527a3ccb98b507c3c3048a546f297',
  },
};
