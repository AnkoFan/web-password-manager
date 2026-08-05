FROM scratch

ARG VERSION
LABEL org.opencontainers.image.title="WebPasswordManager Windows installer"
LABEL org.opencontainers.image.description="WebPasswordManager NSIS installer for Windows x64"
LABEL org.opencontainers.image.source="https://github.com/AnkoFan/web-password-manager"
LABEL org.opencontainers.image.version="$VERSION"
LABEL org.opencontainers.image.licenses="MIT"

COPY package/*.exe /packages/
