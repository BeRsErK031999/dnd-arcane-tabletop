!macro removeArcaneTabletopAppData
  DetailPrint "Removing previous D&D Arcane Tabletop user data..."
  RMDir /r "$APPDATA\${APP_FILENAME}"

  !ifdef APP_PRODUCT_FILENAME
    RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
  !endif

  !ifdef APP_PACKAGE_NAME
    RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
  !endif
!macroend

!macro customInstall
  # Electron stores campaigns in per-user app data. Clear it before first launch
  # so a reinstall starts with a fresh reference campaign.
  ${if} $installMode == "all"
    SetShellVarContext current
  ${endif}

  !insertmacro removeArcaneTabletopAppData

  ${if} $installMode == "all"
    SetShellVarContext all
  ${endif}
!macroend
