<?php
/**
 * Assistant de Mise à jour EOCheck (Inspiration Dolibarr)
 */
$confFile = __DIR__ . '/../conf/conf.php';
if (!file_exists($confFile)) {
    die("Fichier de configuration introuvable. Veuillez installer l'application d'abord.");
}

$content = file_get_contents($confFile);
preg_match('/\$eocheck_main_db_host\s*=\s*[\'"](.*?)[\'"]/', $content, $m); $dbHost = $m[1] ?? '';
preg_match('/\$eocheck_main_db_name\s*=\s*[\'"](.*?)[\'"]/', $content, $m); $dbName = $m[1] ?? '';
preg_match('/\$eocheck_main_db_user\s*=\s*[\'"](.*?)[\'"]/', $content, $m); $dbUser = $m[1] ?? '';
preg_match('/\$eocheck_main_db_pass\s*=\s*[\'"](.*?)[\'"]/', $content, $m); $dbPass = $m[1] ?? '';
preg_match('/\$eocheck_main_db_prefix\s*=\s*[\'"](.*?)[\'"]/', $content, $m); $dbPrefix = $m[1] ?? '';

// Connexion pour vérifier la version
$dbVersion = '0.0.0';
$codeVersion = '1.1.0'; // Version codée en dur pour l'exemple (devrait venir du package.json)

try {
    $pdo = new PDO("mysql:host=$dbHost;dbname=$dbName;charset=utf8", $dbUser, $dbPass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $stmt = $pdo->query("SELECT value FROM {$dbPrefix}const WHERE name = 'MAIN_DB_VERSION'");
    if ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $dbVersion = $row['value'];
    }
} catch (Exception $e) {
    die("Erreur de connexion à la base : " . $e->getMessage());
}

$action = $_POST['action'] ?? '';
$outputHtml = "";

if ($action === 'upgrade') {
    $outputHtml .= "<h3>Migration de la base de données (structure + certaines données)</h3>";
    $outputHtml .= "Connexion au serveur : <strong>$dbHost</strong><br>";
    $outputHtml .= "Connexion à la base : <strong>$dbName</strong><br><br>";
    
    // Exécution du migrator.js de Node.js
    $cmd = "node " . escapeshellarg(__DIR__ . '/../src/db/migrator.js') . " 2>&1";
    exec($cmd, $output, $return_var);
    
    $outputHtml .= "<div style='background:#f4f4f4; padding:10px; border:1px solid #ddd; font-family:monospace; font-size:12px; margin-top:10px;'>";
    foreach ($output as $line) {
        $outputHtml .= htmlspecialchars($line) . "<br>";
    }
    $outputHtml .= "</div>";

    if ($return_var === 0) {
        $outputHtml .= "<div class='success'>Migration terminée avec succès !</div>";
    } else {
        $outputHtml .= "<div class='error'>Erreur lors de la migration.</div>";
    }
}
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Mise à jour EOCheck</title>
    <style>
        body { font-family: Arial, sans-serif; background: #fff; margin: 0; padding: 40px; color: #333; }
        .container { max-width: 900px; margin: 0 auto; }
        .header { border-bottom: 2px solid #5bc0de; padding-bottom: 10px; margin-bottom: 20px; font-size: 20px; color: #5bc0de; }
        .version-box { margin: 20px 0; font-size: 14px; }
        .badge-old { background: #5bc0de; color: white; padding: 3px 8px; border-radius: 3px; font-weight: bold; }
        .badge-new { background: #5cb85c; color: white; padding: 3px 8px; border-radius: 3px; font-weight: bold; }
        .upgrade-card { border: 1px solid #ddd; border-radius: 4px; padding: 20px; background: #f9f9f9; display: flex; justify-content: space-between; align-items: center; margin-top:20px; }
        .btn { background: #997bb5; color: white; border: none; padding: 10px 20px; font-size: 14px; border-radius: 3px; cursor: pointer; text-decoration: none; font-weight: bold;}
        .btn:hover { background: #8a6aa6; }
        .success { color: #155724; background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; margin-top: 20px; border-radius: 4px; }
        .error { color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; margin-top: 20px; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">Installation ou mise à jour d'EOCheck</div>

        <?php if (!$action): ?>
        <p><strong>⚙️ Vérification des prérequis</strong></p>
        <ul style="list-style-type: '✔️ '; color: green; font-size:14px; line-height: 1.6;">
            <li>Version de PHP <?= PHP_VERSION ?></li>
            <li>Le fichier de configuration conf/conf.php existe.</li>
            <li>La base de données est accessible.</li>
        </ul>

        <div class="version-box">
            Dernière version mise à jour <span class="badge-old"><?= htmlspecialchars($dbVersion) ?></span> - Version du programme <span class="badge-new"><?= htmlspecialchars($codeVersion) ?></span>
        </div>

        <?php if (version_compare($dbVersion, $codeVersion, '<')): ?>
            <p style="margin-top: 30px;"><strong>⚙️ Choisissez votre mode d'installation et cliquez sur "Démarrer"...</strong></p>
            <div class="upgrade-card">
                <div style="flex: 1;">
                    <strong>Mise à jour<br><?= htmlspecialchars($dbVersion) ?> -&gt; <?= htmlspecialchars($codeVersion) ?></strong>
                </div>
                <div style="flex: 3; font-size: 13px; color: #555; padding: 0 20px;">
                    Utilisez ce mode après avoir écrasé les fichiers d'une ancienne installation EOCheck par ceux d'une version plus récente. Ce choix permet de mettre à jour votre base et vos données pour cette nouvelle version.<br><br>
                    <span style="color:#5bc0de;">Choix suggéré par l'installeur.</span>
                </div>
                <div>
                    <form method="POST">
                        <input type="hidden" name="action" value="upgrade">
                        <button type="submit" class="btn">Démarrer</button>
                    </form>
                </div>
            </div>
        <?php else: ?>
            <div class="success">Votre base de données est déjà à jour (Version <?= htmlspecialchars($dbVersion) ?>). Aucune migration nécessaire.</div>
        <?php endif; ?>

        <?php else: ?>
            <!-- Affichage du résultat de la migration -->
            <?= $outputHtml ?>
            
            <?php if ($return_var === 0): ?>
                <div style="text-align: center; margin-top: 30px;">
                    <a href="../public/login.html" style="padding: 10px 20px; background: #f4f4f4; border: 1px solid #ccc; text-decoration: none; color: #333;">Étape suivante -&gt;</a>
                </div>
            <?php endif; ?>
        <?php endif; ?>

    </div>
</body>
</html>
