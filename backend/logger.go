package backend

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Глобальный логгер приложения. Пишет одновременно в stdout (видно в консоли
// разработки wails) и в файл player.log рядом с музыкальной библиотекой
// (~/.synapse/player.log). Это позволяет отслеживать все действия: загрузку
// треков, запуск/паузу, seek, переключение дорожек, ошибки движка и т.д.
var (
	appLogger     *log.Logger
	appLogFile    *os.File
	appLoggerOnce *sync.Once = &sync.Once{}
	appLoggerMu   sync.Mutex
	appLoggerOn   = true
)

// LogLevel описывает важность сообщения.
type LogLevel string

const (
	LogDebug LogLevel = "DEBUG"
	LogInfo  LogLevel = "INFO "
	LogWarn  LogLevel = "WARN "
	LogError LogLevel = "ERROR"
)

// RotateAndCleanupLogs checks ~/.synapse/player.log and engine.log files.
// It deletes files older than 7 days, or larger than 5 MB, to save disk space.
func RotateAndCleanupLogs() {
	home, err := os.UserHomeDir()
	if err != nil {
		return
	}
	dir := filepath.Join(home, ".synapse")
	maxAge := 7 * 24 * time.Hour
	maxSize := int64(5 * 1024 * 1024) // 5 MB

	logFiles := []string{"player.log", "engine.log"}
	for _, fName := range logFiles {
		path := filepath.Join(dir, fName)
		info, err := os.Stat(path)
		if err != nil {
			continue // file does not exist, safe to skip
		}
		if time.Since(info.ModTime()) > maxAge || info.Size() > maxSize {
			_ = os.Remove(path)
		}
	}
}

// InitLogger инициализирует глобальный логгер. Безопасно вызывать несколько
// раз — повторные вызовы ничего не делают.
func InitLogger() {
	appLoggerOnce.Do(func() {
		RotateAndCleanupLogs()

		appLogger = log.New(os.Stdout, "", 0)

		home, err := os.UserHomeDir()
		if err != nil {
			Log(LogWarn, "logger", "не удалось определить home dir: %v", err)
			return
		}
		dir := filepath.Join(home, ".synapse")
		if err := os.MkdirAll(dir, 0755); err != nil {
			Log(LogWarn, "logger", "не удалось создать dir %s: %v", dir, err)
			return
		}
		logPath := filepath.Join(dir, "player.log")
		f, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
		if err != nil {
			Log(LogWarn, "logger", "не удалось открыть лог-файл %s: %v", logPath, err)
			return
		}
		appLogFile = f
		// Пишем и в stdout, и в файл.
		appLogger.SetOutput(io.MultiWriter(os.Stdout, f))
		appLogger.Printf("%s [INFO ] logger: логирование запущено, файл=%s", time.Now().Format("2006-01-02 15:04:05.000"), logPath)
	})
}

// Log записывает сообщение в лог с указанным уровнем и категорией (например,
// "engine", "app", "library"). Аргументы форматируются как fmt.Sprintf.
func Log(level LogLevel, category, format string, args ...interface{}) {
	if !appLoggerOn || appLogger == nil {
		return
	}
	appLoggerMu.Lock()
	defer appLoggerMu.Unlock()
	msg := fmt.Sprintf(format, args...)
	appLogger.Printf("%s [%s] [%s] %s", time.Now().Format("2006-01-02 15:04:05.000"), string(level), category, msg)
}

// CloseLogger закрывает файл лога — вызывается при завершении приложения.
func CloseLogger() {
	appLoggerMu.Lock()
	defer appLoggerMu.Unlock()
	if appLogFile != nil {
		_ = appLogFile.Close()
		appLogFile = nil
	}
}
