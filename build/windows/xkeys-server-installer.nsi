!define APPNAME "Xkeys Server"
!define DESCRIPTION "Xkeys Server"
!define VERSIONMAJOR 0
!define VERSIONMINOR 9
!define VERSIONBUILD 1

!define HELPURL "https://gitlab.com/chris.willing/xkeys-server"


# The name of the installer
Name "Xkeys-Server Installer"

# The file to write
OutFile "xkeys-server-installer.exe"

# Request application privileges for Windows Vista
RequestExecutionLevel admin
InstallDir "$PROGRAMFILES\${APPNAME}"

LicenseData "LICENSE"

!include LogicLib.nsh
#--------------------------------

# Pages
Page license
Page directory
Page instfiles

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
functionEnd

section install

  # Set output path to the installation directory.
  setOutPath $INSTDIR
  
  # Put file there
  file "application\xkeys-server.exe"
  
SectionEnd
