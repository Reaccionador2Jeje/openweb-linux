FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8 LC_ALL=C.UTF-8 TERM=xterm-256color
RUN apt-get update && apt-get install -y --no-install-recommends bash bash-completion ca-certificates curl wget git sudo python3 python3-pip python3-venv build-essential pkg-config nano vim-tiny less file tree procps psmisc iproute2 iputils-ping dnsutils net-tools openssh-client rsync unzip zip tar gzip xz-utils jq make cmake locales && locale-gen C.UTF-8 && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --shell /bin/bash --uid 1000 openweb && install -d -o openweb -g openweb /workspace && printf 'openweb ALL=(root) NOPASSWD: /usr/bin/apt, /usr/bin/apt-get\n' > /etc/sudoers.d/openweb-apt && chmod 0440 /etc/sudoers.d/openweb-apt && printf '\nexport TERM=xterm-256color\nexport EDITOR=nano\nexport PAGER=less\n' >> /home/openweb/.bashrc && printf 'PS1="\\[\\e[1;32m\\]openweb@ubuntu\\[\\e[0m\\]:\\[\\e[1;34m\\]\\w\\[\\e[0m\\]\\$ "\n' >> /home/openweb/.bashrc && chown openweb:openweb /home/openweb/.bashrc
WORKDIR /home/openweb
USER openweb
CMD ["sleep","infinity"]
