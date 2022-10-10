!include "MUI.nsh"

!define APPNAME "Xkeys Server"
!define ServiceName "XkeysServer"
!define DESCRIPTION "Xkeys Server"
!define XKEYS_SERVER_VERSION "0.10.2"

# The name of the installer
Name "Xkeys-Server Installer"

# The file to write
OutFile "xkeys-server-installer-${XKEYS_SERVER_VERSION}.exe"

# Where to install files
InstallDir "$PROGRAMFILES\${APPNAME}"

# Bonjour installed location
!define BonjourDir "$PROGRAMFILES\Bonjour"


ShowInstDetails show

# Request application privileges
RequestExecutionLevel admin

!include LogicLib.nsh		; Library for logical statements
!include "x64.nsh"			; Macros for x64 machines

# A way to detect whether a service is running e.g. Bonjour
# Not used at present (in favour of detecting whether Bonjour
# is installed) but keeping around just in case needed later.
#
##= 
#= Service::State
#
# USAGE:
# ${Service::State} "NAME" /DISABLEFSR $0 $1
#
#    ::State     = The service's status is returned. 
#    NAME        = The Service name
#    /DISABLEFSR = Disables redirection if x64. Use "" to skip.
#    $0          = Return after call | 1 = success
#    $1          =   ''    ''    ''  | 1 = running
#
# $1 will now hold "1" if running or "0" if not
#
!define Service::State `!insertmacro _Service::State`
!macro _Service::State _SVC _FSR _ERR1 _ERR2
	ReadEnvStr $R0 COMSPEC
	StrCmpS $Bit 64 0 +4
	StrCmp "${_FSR}" /DISABLEFSR 0 +3
	ExecDos::Exec /TOSTACK /DISABLEFSR `"$R0" /c "${SC} query "${_SVC}" | find /C "RUNNING""`
	Goto +2
	ExecDos::Exec /TOSTACK `"$R0" /c "${SC} query "${_SVC}" | find /C "RUNNING""`
	Pop ${_ERR1}
	Pop ${_ERR2}
!macroend

#--------------------------------

# Pages
!insertMacro MUI_PAGE_WELCOME
!insertMacro MUI_PAGE_LICENSE "..\..\LICENSE"
!insertMacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

  # These indented statements modify setting for MUI_PAGE_FINISH
  !define MUI_FINISHPAGE_NOAUTOCLOSE
  !define MUI_FINISHPAGE_NOREBOOTSUPPORT
  !define MUI_FINISHPAGE_RUN
    !define NUI_FINISHPAGE_RUN_NOTCHECKED
    !define MUI_FINISHPAGE_RUN_TEXT "Start Xkeys Server"
    !define MUI_FINISHPAGE_RUN_FUNCTION "LaunchApp"
  !define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
    !define MUI_FINISHPAGE_SHOWREADME $INSTDIR\LICENSE
  !define MUI_FINISHPAGE_LINK "Xkeys Server development repository"
    !define MUI_FINISHPAGE_LINK_LOCATION https://gitlab.com/chris.willing/xkeys-server
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

#--------------------------------

!macro VerifyUserIsAdmin
UserInfo::GetAccountType
pop $0
${If} $0 != "admin"
  messageBox mb_iconstop "Administrator rights required"
  setErrorLevel 740 ; ERROR_ELEVATION REQUIRED
  quit
${EndIf}
!macroend

function .onInit
  setShellVarContext all
  !insertmacro VerifyUserIsAdmin

  IfFileExists  ${BonjourDir}\mDNSResponder.exe bonjourthere bonjournotthere
	bonjourthere:
		MessageBox MB_OK "Bonjour already installed"
		Goto check_xkeys_installation
	bonjournotthere:
		MessageBox MB_YESNO|MB_ICONQUESTION "Bonjour not found - install it now?" /SD IDYES IDYES install_bonjour
		  Goto check_xkeys_installation
		install_bonjour:
		  call InstallBonjour

  # Check if already installed (assumes location hasn't changed since installed version)
  check_xkeys_installation:
  IfFileExists  $INSTDIR\run-app.vbs askdelete nothingthere
    askdelete:
      MessageBox MB_YESNO|MB_ICONQUESTION "Uninstall existing xkeys-server installation?" /SD IDYES IDYES deleteexisting
        abort
      deleteexisting:
        # First try to kill any running instance
        ExecWait "taskkill -f -im xkeys-server.exe"

        # Delete key that starts xkeys-server on system startup
        DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Run ${APPNAME}"

        # Wait to ensure xkeys-server has stopped before cleaning up
        Sleep 2000
        delete $INSTDIR\*
        rmDir $INSTDIR
    nothingthere:
functionEnd

function InstallBonjour
	File "Bonjour.msi"
	File "Bonjour64.msi"
	${If} ${RunningX64}
		ExecWait '"msiexec" /i "Bonjour64.msi"'
	${Else}
		ExecWait '"msiexec" /i "Bonjour.msi"'
	${Endif}

functionEnd

function LaunchApp
  # Run xkeys-server now
  setShellVarContext all
  !insertmacro VerifyUserIsAdmin

  ExecShell "" "$INSTDIR\run-app.vbs"
functionEnd

section "install"
  # Set output path to the installation directory.
  setOutPath $INSTDIR
  
  # Put file there
  file "application\xkeys-server.exe"
  file "run-app.vbs"
  file "..\..\LICENSE"

  # Write an uninstaller
  writeUninstaller "$INSTDIR\uninstall-Xkeys-Server.exe"

  # Run xkeys-server at system start
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "${APPNAME}" '"$INSTDIR\run-app.vbs"'
SectionEnd


# Uninstaller

function un.onInit
  setShellVarContext all

  # Verify the uninstaller
  MessageBox MB_OKCANCEL "Permanently remove ${APPNAME}?" IDOK next
	abort
  next:
  !insertmacro VerifyUserIsAdmin
functionEnd

section "uninstall"
  # First try to kill any running instance
  ExecWait "taskkill -f -im xkeys-server.exe"

  # Delete key that starts xkeys-server on system startup
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Run\${APPNAME}"

  # Wait to ensure xkeys-server has stopped before cleaning up
  Sleep 2000
  delete $INSTDIR\*
  rmDir $INSTDIR
sectionEnd
