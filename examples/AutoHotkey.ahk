#NoEnv  ; Recommended for performance and compatibility with future AutoHotkey releases.
; #Warn  ; Enable warnings to assist with detecting common errors.
SendMode Input  ; Recommended for new scripts due to its superior speed and reliability.
SetWorkingDir %A_ScriptDir%  ; Ensures a consistent starting directory.
;
SetTitleMatchMode, 2 ; Partial match - contained anywhere in WinTitle


if (A_Args.length() == 2) {
	WinActivate, %1%
	WinWaitActive, %1%
	Send %2%
	return
} else if (A_Args.length() == 3) {
	WinActivate, %1%
	WinWaitActive, %1%
	Send %2%
	Send %3%
	return
} else if (A_Args.length() == 4) {
	WinActivate, %1%
	WinWaitActive, %1%
	Send %2%
	Send %3%
	Send %4%
	return
}
Exit

