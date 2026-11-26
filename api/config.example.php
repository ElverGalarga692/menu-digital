<?php
// Copia este archivo como config.php (en esta misma carpeta api/) y
// complétalo con los datos de la base de datos que creaste en el panel del
// hosting (cPanel → Bases de datos MySQL).
return [
    'db_host' => 'localhost',          // casi siempre 'localhost'
    'db_name' => 'usuario_menu',       // nombre completo de la base de datos
    'db_user' => 'usuario_menu',       // usuario de MySQL con permisos sobre esa base
    'db_pass' => 'CONTRASEÑA-DE-MYSQL',

    // Tu correo de superadministrador: el único que puede hacer la primera
    // carga de datos con migrar.html.
    'admin_email' => 'tu-correo@ejemplo.com',
];
