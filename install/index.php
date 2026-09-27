<?php
/**
 * Page d'installation EOCheck (Inspiration Dolibarr)
 */
$lockFile = __DIR__ . '/../install.lock';
$confFile = __DIR__ . '/../conf/conf.php';

if (file_exists($lockFile)) {
    die("L'installation est déjà verrouillée par le fichier install.lock. Veuillez le supprimer pour réinstaller.");
}

$message = "";

// 1. Vérification des prérequis systèmes
$checks = [];

// Check PHP Version
$phpOk = version_compare(PHP_VERSION, '7.4.0', '>=');
$checks[] = ['name' => 'Version PHP (>= 7.4.0)', 'ok' => $phpOk, 'val' => PHP_VERSION];

// Check conf.php exists and is readable
$confOk = file_exists($confFile) && is_readable($confFile);
$checks[] = ['name' => 'Fichier conf/conf.php présent', 'ok' => $confOk, 'val' => $confOk ? 'Oui' : 'Non'];

// Check exec() is enabled
$execOk = function_exists('exec') && !in_array('exec', array_map('trim', explode(', ', ini_get('disable_functions'))));
$checks[] = ['name' => 'Fonction PHP exec() activée', 'ok' => $execOk, 'val' => $execOk ? 'Oui' : 'Non'];

// Try to parse conf.php
$dbHost = $dbPort = $dbName = $dbUser = $dbPass = $dbPrefix = '';
if ($confOk) {
    $confContent = file_get_contents($confFile);
    preg_match('/\$eocheck_main_db_host\s*=\s*[\'"](.*?)[\'"]/', $confContent, $m); $dbHost = $m[1] ?? '';
    preg_match('/\$eocheck_main_db_port\s*=\s*[\'"](.*?)[\'"]/', $confContent, $m); $dbPort = $m[1] ?? '';
    preg_match('/\$eocheck_main_db_name\s*=\s*[\'"](.*?)[\'"]/', $confContent, $m); $dbName = $m[1] ?? '';
    preg_match('/\$eocheck_main_db_user\s*=\s*[\'"](.*?)[\'"]/', $confContent, $m); $dbUser = $m[1] ?? '';
    preg_match('/\$eocheck_main_db_pass\s*=\s*[\'"](.*?)[\'"]/', $confContent, $m); $dbPass = $m[1] ?? '';
    preg_match('/\$eocheck_main_db_prefix\s*=\s*[\'"](.*?)[\'"]/', $confContent, $m); $dbPrefix = $m[1] ?? '';
    
    $checks[] = ['name' => 'Configuration BDD (Hôte)', 'ok' => !empty($dbHost), 'val' => $dbHost];
    $checks[] = ['name' => 'Configuration BDD (User)', 'ok' => !empty($dbUser), 'val' => $dbUser];
    $checks[] = ['name' => 'Configuration BDD (Nom)', 'ok' => !empty($dbName), 'val' => $dbName];
}

$allOk = true;
foreach ($checks as $c) {
    if (!$c['ok']) $allOk = false;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'install' && $allOk) {
    // Exécuter le script Node.js d'installation
    $output = [];
    $return_var = 0;
    
    exec("node " . escapeshellarg(__DIR__ . '/../src/db/installer.js') . " 2>&1", $output, $return_var);
    
    if ($return_var === 0) {
        file_put_contents($lockFile, "Installation le " . date('Y-m-d H:i:s'));
        $message = "<div class='success'>Installation réussie ! La base de données a été créée.<br><a href='../public/login.html' class='btn'>Accéder à l'application</a></div>";
    } else {
        $message = "<div class='error'>Erreur lors de l'installation :<br><pre>" . htmlspecialchars(implode("\n", $output)) . "</pre></div>";
    }
}
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Installation EOCheck</title>
    <style>
        body { font-family: Arial, sans-serif; background: #f4f7f6; margin: 0; padding: 40px; }
        .install-box { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 700px; margin: 0 auto; }
        h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px;}
        .btn { background: #007bff; color: white; border: none; padding: 10px 20px; font-size: 16px; border-radius: 4px; cursor: pointer; text-decoration: none; margin-top: 20px; display: inline-block; }
        .btn:hover { background: #0056b3; }
        .btn:disabled { background: #ccc; cursor: not-allowed; }
        .success { color: #155724; background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; margin-top: 20px; border-radius: 4px; }
        .error { color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; margin-top: 20px; border-radius: 4px; text-align: left;}
        pre { white-space: pre-wrap; font-size: 12px; background: #fff; padding: 10px; border: 1px solid #ddd; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 10px; border: 1px solid #ddd; text-align: left; }
        th { background: #f9f9f9; }
        .status-ok { color: green; font-weight: bold; }
        .status-err { color: red; font-weight: bold; }
    </style>
</head>
<body>
    <div class="install-box">
        <h1>Installation d'EOCheck (Prérequis)</h1>
        <p>Vérification des prérequis systèmes et de la configuration avant l'installation de la base de données.</p>
        
        <?php if (!empty($message)) { echo $message; } else { ?>
        
        <table>
            <tr>
                <th>Composant</th>
                <th>Valeur détectée</th>
                <th>Statut</th>
            </tr>
            <?php foreach ($checks as $c): ?>
            <tr>
                <td><?php echo htmlspecialchars($c['name']); ?></td>
                <td><?php echo htmlspecialchars($c['val']); ?></td>
                <td class="<?php echo $c['ok'] ? 'status-ok' : 'status-err'; ?>">
                    <?php echo $c['ok'] ? 'OK' : 'ERREUR'; ?>
                </td>
            </tr>
            <?php endforeach; ?>
        </table>

        <?php if (!$allOk): ?>
            <div class="error">Certains prérequis ne sont pas remplis. Veuillez corriger les erreurs ci-dessus et rafraîchir la page.</div>
        <?php endif; ?>

        <?php if (!file_exists($lockFile)): ?>
        <form method="POST">
            <input type="hidden" name="action" value="install">
            <button type="submit" class="btn" <?php echo $allOk ? '' : 'disabled'; ?>>Lancer l'installation de la Base de Données</button>
        </form>
        <?php endif; ?>
        
        <?php } ?>
    </div>
</body>
</html>
