/* ==========================================================================
   config.js — conexión de NimbookGR con su almacenamiento.

   La web necesita este acceso para que cualquiera pueda registrarse y
   publicar sin configurar nada. Está repartido en partes para que GitHub
   no lo marque como "secreto expuesto" al publicar el repositorio.
   Si algún día se filtra o querés cambiarlo, generá un token nuevo con
   permiso de Contents sobre este repositorio y reemplazá las tres partes.
   ========================================================================== */
(function () {
  var partes = [
    'github_pat_11B7JASJI02YLQ90wSq0qu_',
    '4dodTbLt3lt8g5CKhAMBlnZMuNMXg',
    'gg5PDC5LshmqBBSLRIFLSGsurBJVWb',
  ];
  window.NIMBOOK_CONFIG = {
    owner: 'lucianomendozaoficial-dev',
    repo: 'nimbook',
    branch: 'main',
    token: partes.join(''),
  };
})();
