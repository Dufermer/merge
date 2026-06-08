// commandSecurity.js — безопасное выполнение shell команд
// White list + black list для предотвращения опасных операций

const BLACKLIST = [
  // Файловые операции
  "rm ", "rmdir", "del ", "rd ", "erase",
  "remove-item", "remove -item", "ri ",
  "format", "fdisk", "mkfs",
  // Системные
  "shutdown", "restart-computer", "stop-computer",
  "reboot", "halt", "poweroff", "init 0", "init 6",
  // Сеть
  "iptables", "ufw", "firewall",
  // Права
  "chmod 777", "chown", "sudo ", "su ",
  "runas", "takeown",
  // Процессы
  "kill ", "taskkill", "stop-process",
  // Диск
  "dd ", "diskpart", "diskutil",
  // Реестр Windows
  "reg ", "regedit", "regini",
  // Скрипты
  "wget ", "curl -o", "curl -O", "invoke-webrequest",
  "iex ", "invoke-expression",
  // Пакеты
  "apt ", "yum ", "dnf ", "pacman ", "winget", "choco",
];

const WHITELIST_PREFIXES = [
  "ls", "dir", "get-childitem", "gci",
  "cat", "type", "get-content", "gc",
  "echo", "write-host",
  "pwd", "get-location", "gl",
  "date", "get-date",
  "hostname", "whoami",
  "ipconfig", "get-netipaddress",
  "findstr", "select-string",
  "measure", "group-object",
  "where", "where-object",
  "sort", "sort-object",
  "select", "select-object",
  "foreach", "foreach-object",
  "|", ">", ">>", "<",
  "wc", "find",
  "systeminfo",
  "tasklist", "get-process",
  "netstat",
  "powershell",
];

class CommandSecurity {
  validate(command) {
    const lower = command.toLowerCase().trim();

    // Check blacklist
    for (const pattern of BLACKLIST) {
      if (lower.includes(pattern.toLowerCase())) {
        return {
          allowed: false,
          reason: `Blocked by security policy: '${pattern}' is not allowed`,
          command,
        };
      }
    }

    // Check if command starts with a whitelisted prefix
    const firstWord = lower.split(/\s+/)[0] || "";
    const isWhitelisted = WHITELIST_PREFIXES.some(
      (prefix) => firstWord === prefix || lower.startsWith(prefix + " ")
    );

    if (!isWhitelisted) {
      // Allow 'Get-*' PowerShell commands
      if (firstWord.startsWith("get-") || firstWord.startsWith("select-") || firstWord.startsWith("where-")) {
        return { allowed: true, command };
      }
      return {
        allowed: false,
        reason: `Blocked by security policy: '${firstWord}' is not in the allowed commands list`,
        command,
      };
    }

    return { allowed: true, command };
  }
}

module.exports = { CommandSecurity };
