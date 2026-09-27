<?php
/**
 * Point d'entrée principal EOCheck (Inspiration Dolibarr)
 * Redirige vers l'application ou vers l'installateur.
 */

$lockFile = __DIR__ . '/install.lock';

if (file_exists($lockFile)) {
    // L'installation est terminée, on redirige vers l'application (frontend)
    header("Location: public/login.html");
    exit;
} else {
    // L'installation n'est pas terminée ou n'a pas été faite
    header("Location: install/index.php");
    exit;
}
