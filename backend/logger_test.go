package backend

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestLogger(t *testing.T) {
	// Reset global state for tests to avoid interference from other tests calling InitLogger
	// Save global state
	origOnce := appLoggerOnce
	origLogger := appLogger
	origLogFile := appLogFile
	origLoggerOn := appLoggerOn
	defer func() {
		appLoggerOnce = origOnce
		appLogger = origLogger
		appLogFile = origLogFile
		appLoggerOn = origLoggerOn
	}()

	appLoggerOnce = &sync.Once{}
	appLogger = nil
	appLogFile = nil
	appLoggerOn = true

	// 1. Setup temporary home directory
	tempHome, err := os.MkdirTemp("", "logger_test_home_*")
	if err != nil {
		t.Fatalf("Failed to create temp home: %v", err)
	}
	defer os.RemoveAll(tempHome)

	origHome := os.Getenv("HOME")
	defer os.Setenv("HOME", origHome)
	os.Setenv("HOME", tempHome)
	origUserProfile := os.Getenv("USERPROFILE")
	defer os.Setenv("USERPROFILE", origUserProfile)
	os.Setenv("USERPROFILE", tempHome)

	// 2. Test InitLogger
	InitLogger()

	logDir := filepath.Join(tempHome, ".0xplayer")
	logFile := filepath.Join(logDir, "player.log")

	if _, err := os.Stat(logFile); os.IsNotExist(err) {
		t.Errorf("InitLogger did not create %s", logFile)
	}

	if appLogFile == nil {
		t.Error("appLogFile is nil after InitLogger")
	}

	// 3. Test Log
	Log(LogInfo, "test_category", "test message %d", 123)

	content, err := os.ReadFile(logFile)
	if err != nil {
		t.Fatalf("Failed to read log file: %v", err)
	}
	contentStr := string(content)

	if !strings.Contains(contentStr, "[INFO ]") {
		t.Errorf("Log did not contain correct level. Got: %s", contentStr)
	}
	if !strings.Contains(contentStr, "[test_category]") {
		t.Errorf("Log did not contain correct category. Got: %s", contentStr)
	}
	if !strings.Contains(contentStr, "test message 123") {
		t.Errorf("Log did not contain correct message. Got: %s", contentStr)
	}

	// 4. Test Log disabled
	appLoggerOn = false
	Log(LogWarn, "disabled_cat", "this should not appear")
	appLoggerOn = true

	contentAfter, _ := os.ReadFile(logFile)
	if strings.Contains(string(contentAfter), "disabled_cat") {
		t.Errorf("Disabled logger still wrote to file")
	}

	// 5. Test CloseLogger
	CloseLogger()
	if appLogFile != nil {
		t.Error("appLogFile is not nil after CloseLogger")
	}
}

func TestInitLogger_HomeDirError(t *testing.T) {
	// Save global state
	origOnce := appLoggerOnce
	origLogger := appLogger
	origLogFile := appLogFile
	origLoggerOn := appLoggerOn
	defer func() {
		appLoggerOnce = origOnce
		appLogger = origLogger
		appLogFile = origLogFile
		appLoggerOn = origLoggerOn
	}()

	appLoggerOnce = &sync.Once{}
	appLogger = nil
	appLogFile = nil
	appLoggerOn = true

	// Unset HOME to force os.UserHomeDir to fail on linux
	origHome := os.Getenv("HOME")
	defer os.Setenv("HOME", origHome)
	os.Unsetenv("HOME")
	origUserProfile := os.Getenv("USERPROFILE")
	defer os.Setenv("USERPROFILE", origUserProfile)
	os.Unsetenv("USERPROFILE")

	InitLogger()

	if appLogFile != nil {
		t.Error("appLogFile should be nil when home dir cannot be determined")
	}
}

func TestInitLogger_MkdirError(t *testing.T) {
	// Save global state
	origOnce := appLoggerOnce
	origLogger := appLogger
	origLogFile := appLogFile
	origLoggerOn := appLoggerOn
	defer func() {
		appLoggerOnce = origOnce
		appLogger = origLogger
		appLogFile = origLogFile
		appLoggerOn = origLoggerOn
	}()

	appLoggerOnce = &sync.Once{}
	appLogger = nil
	appLogFile = nil
	appLoggerOn = true

	tempHome, err := os.MkdirTemp("", "logger_test_home_*")
	if err != nil {
		t.Fatalf("Failed to create temp home: %v", err)
	}
	defer os.RemoveAll(tempHome)

	origHome := os.Getenv("HOME")
	defer os.Setenv("HOME", origHome)
	os.Setenv("HOME", tempHome)
	origUserProfile := os.Getenv("USERPROFILE")
	defer os.Setenv("USERPROFILE", origUserProfile)
	os.Setenv("USERPROFILE", tempHome)

	// Create a file where the .0xplayer directory should be
	dir := filepath.Join(tempHome, ".0xplayer")
	if err := os.WriteFile(dir, []byte("file instead of dir"), 0644); err != nil {
		t.Fatalf("Failed to create obstructing file: %v", err)
	}

	InitLogger()

	if appLogFile != nil {
		t.Error("appLogFile should be nil when MkdirAll fails")
	}
}

func TestInitLogger_OpenFileError(t *testing.T) {
	// Save global state
	origOnce := appLoggerOnce
	origLogger := appLogger
	origLogFile := appLogFile
	origLoggerOn := appLoggerOn
	defer func() {
		appLoggerOnce = origOnce
		appLogger = origLogger
		appLogFile = origLogFile
		appLoggerOn = origLoggerOn
	}()

	appLoggerOnce = &sync.Once{}
	appLogger = nil
	appLogFile = nil
	appLoggerOn = true

	tempHome, err := os.MkdirTemp("", "logger_test_home_*")
	if err != nil {
		t.Fatalf("Failed to create temp home: %v", err)
	}
	defer os.RemoveAll(tempHome)

	origHome := os.Getenv("HOME")
	defer os.Setenv("HOME", origHome)
	os.Setenv("HOME", tempHome)
	origUserProfile := os.Getenv("USERPROFILE")
	defer os.Setenv("USERPROFILE", origUserProfile)
	os.Setenv("USERPROFILE", tempHome)

	dir := filepath.Join(tempHome, ".0xplayer")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatalf("Failed to create dir: %v", err)
	}

	// Create a directory where the log file should be
	logFile := filepath.Join(dir, "player.log")
	if err := os.MkdirAll(logFile, 0755); err != nil {
		t.Fatalf("Failed to create obstructing directory: %v", err)
	}

	InitLogger()

	if appLogFile != nil {
		t.Error("appLogFile should be nil when OpenFile fails")
	}
}

func TestInitLogger_MultipleCalls(t *testing.T) {
	// Save global state
	origOnce := appLoggerOnce
	origLogger := appLogger
	origLogFile := appLogFile
	origLoggerOn := appLoggerOn
	defer func() {
		appLoggerOnce = origOnce
		appLogger = origLogger
		appLogFile = origLogFile
		appLoggerOn = origLoggerOn
	}()

	appLoggerOnce = &sync.Once{}
	appLogger = nil
	appLogFile = nil
	appLoggerOn = true

	tempHome, err := os.MkdirTemp("", "logger_test_home_*")
	if err != nil {
		t.Fatalf("Failed to create temp home: %v", err)
	}
	defer os.RemoveAll(tempHome)

	origHome := os.Getenv("HOME")
	defer os.Setenv("HOME", origHome)
	os.Setenv("HOME", tempHome)
	origUserProfile := os.Getenv("USERPROFILE")
	defer os.Setenv("USERPROFILE", origUserProfile)
	os.Setenv("USERPROFILE", tempHome)

	InitLogger()
	firstLogFile := appLogFile

	InitLogger() // Should be a no-op

	if appLogFile != firstLogFile {
		t.Error("appLogFile changed after second InitLogger call")
	}

	CloseLogger()
}

func TestRotateAndCleanupLogs(t *testing.T) {
	tempHome, err := os.MkdirTemp("", "logger_rotate_test_home_*")
	if err != nil {
		t.Fatalf("Failed to create temp home: %v", err)
	}
	defer os.RemoveAll(tempHome)

	origHome := os.Getenv("HOME")
	defer os.Setenv("HOME", origHome)
	os.Setenv("HOME", tempHome)
	origUserProfile := os.Getenv("USERPROFILE")
	defer os.Setenv("USERPROFILE", origUserProfile)
	os.Setenv("USERPROFILE", tempHome)

	dir := filepath.Join(tempHome, ".0xplayer")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatalf("Failed to create dir: %v", err)
	}

	playerLogPath := filepath.Join(dir, "player.log")
	engineLogPath := filepath.Join(dir, "engine.log")

	// 1. Create a large player.log file (6 MB)
	largeData := make([]byte, 6*1024*1024)
	if err := os.WriteFile(playerLogPath, largeData, 0644); err != nil {
		t.Fatalf("Failed to write player.log: %v", err)
	}

	// 2. Create an old engine.log file
	if err := os.WriteFile(engineLogPath, []byte("some old logs"), 0644); err != nil {
		t.Fatalf("Failed to write engine.log: %v", err)
	}
	oldTime := time.Now().Add(-8 * 24 * time.Hour)
	if err := os.Chtimes(engineLogPath, oldTime, oldTime); err != nil {
		t.Fatalf("Failed to set old modification time on engine.log: %v", err)
	}

	// Run cleanup
	RotateAndCleanupLogs()

	// Both should be deleted
	if _, err := os.Stat(playerLogPath); !os.IsNotExist(err) {
		t.Error("Oversized player.log was not deleted")
	}
	if _, err := os.Stat(engineLogPath); !os.IsNotExist(err) {
		t.Error("Outdated engine.log was not deleted")
	}
}

