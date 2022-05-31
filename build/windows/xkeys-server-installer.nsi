!include "MUI.nsh"

!define APPNAME "Xkeys Server"
!define ServiceName "XkeysServer"
!define DESCRIPTION "Xkeys Server"
!define XKEYS_SERVER_VERSION "0.9.7"

# The name of the installer
Name "Xkeys-Server Installer"

# The file to write
OutFile "xkeys-server-installer-${XKEYS_SERVER_VERSION}.exe"

# Where to install files
InstallDir "$PROGRAMFILES\${APPNAME}"

ShowInstDetails show

# Request application privileges
RequestExecutionLevel admin

!include LogicLib.nsh
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

  # Check if already installed (assumes location hasn't changed since installed version)
  IfFileExists  $INSTDIR\run-app.vbs askdelete nothingthere
    askdelete:
      MessageBox MB_YESNO|MB_ICONQUESTION "Uninstall existing version?" /SD IDYES IDYES deleteexisting
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
