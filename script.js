// Configuración
const CONFIG = {
    // CAMBIA ESTE ENLACE POR EL DE TU STREAMING
    STREAM_URL: 'https://stream.zeno.fm/e8nskpc98f0uv',
    
    // Mount point para la metadata (obtenido de la URL del stream)
    MOUNT_POINT: 'e8nskpc98f0uv',
    
    STATION_NAME: 'FM Urbana 103.5',
    DEFAULT_VOLUME: 0.8,
    RETRY_DELAY: 5000,
    MAX_RETRIES: 10
};

class RadioPlayer {
    constructor() {
        this.audio = document.getElementById('radioPlayer');
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.playIcon = document.getElementById('playIcon');
        this.pauseIcon = document.getElementById('pauseIcon');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.volumeValue = document.getElementById('volumeValue');
        this.muteBtn = document.getElementById('muteBtn');
        this.volumeBtn = document.getElementById('volume-btn');
        this.statusText = document.getElementById('statusText');
        this.statusDot = document.querySelector('.status-dot');
        this.playerCard = document.querySelector('.player-card');
        this.toast = document.getElementById('toast');
        this.visualizer = document.getElementById('visualizer');
        this.visualizerCtx = this.visualizer.getContext('2d');
        
        // Elementos de metadata
        this.trackTitle = document.getElementById('track-title');
        this.trackArtist = document.getElementById('track-artist');
        this.evtSource = null;
        
        this.isPlaying = false;
        this.isMuted = false;
        this.previousVolume = CONFIG.DEFAULT_VOLUME * 100;
        this.retryCount = 0;
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.animationFrame = null;
        
        this.init();
    }
    
    init() {
        // Configurar audio
        this.audio.src = CONFIG.STREAM_URL;
        this.audio.volume = CONFIG.DEFAULT_VOLUME;
        this.audio.crossOrigin = 'anonymous';
        
        // Configurar event listeners
        this.setupEventListeners();
        
        // Configurar visualizador y ecualizador
        this.setupVisualizer();
        this.setupEq();
        
        // Inicializar UI
        this.updateVolumeUI();
        this.updateConnectionStatus('connecting', 'Conectando...');
        
        // Crear partículas de fondo
        this.createParticles();
        
        // Iniciar metadata
        this.setupMetadata();
        
        // Intentar reproducir automáticamente
        this.attemptAutoplay();
        
        // Listener global para la primera interacción (supera bloqueos de autoplay)
        this.setupFirstInteraction();
        
        // Mostrar mensaje de bienvenida
        setTimeout(() => {
            this.showToast('🎵 ¡Bienvenido a ' + CONFIG.STATION_NAME + '!');
        }, 500);
    }
    
    setupEventListeners() {
        // Reproducir/Pausar
        this.playPauseBtn.addEventListener('click', () => this.togglePlay());
        
        // Control de volumen
        this.volumeSlider.addEventListener('input', () => this.handleVolumeChange());
        this.muteBtn.addEventListener('click', () => this.toggleMute());
        this.volumeBtn.addEventListener('click', () => this.toggleVolumeSlider());
        
        // Eventos de audio
        this.audio.addEventListener('playing', () => this.onPlaying());
        this.audio.addEventListener('pause', () => this.onPause());
        this.audio.addEventListener('waiting', () => this.onBuffering());
        this.audio.addEventListener('error', (e) => this.onError(e));
        this.audio.addEventListener('canplay', () => this.onCanPlay());
        this.audio.addEventListener('ended', () => this.onEnded());
        
        // Atajos de teclado
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.target.matches('input, button')) {
                e.preventDefault();
                this.togglePlay();
            }
        });
    }
    
    setupVisualizer() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            
            this.source = this.audioContext.createMediaElementSource(this.audio);
            
            // Configurar nodos del Ecualizador (Bajos, Medios, Agudos)
            this.lowEq = this.audioContext.createBiquadFilter();
            this.lowEq.type = 'lowshelf';
            this.lowEq.frequency.value = 320;
            this.lowEq.gain.value = 0;

            this.midEq = this.audioContext.createBiquadFilter();
            this.midEq.type = 'peaking';
            this.midEq.frequency.value = 1000;
            this.midEq.Q.value = 0.5;
            this.midEq.gain.value = 0;

            this.highEq = this.audioContext.createBiquadFilter();
            this.highEq.type = 'highshelf';
            this.highEq.frequency.value = 3200;
            this.highEq.gain.value = 0;
            
            // Conectar toda la cadena de audio
            this.source.connect(this.lowEq);
            this.lowEq.connect(this.midEq);
            this.midEq.connect(this.highEq);
            this.highEq.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);
            
            this.startVisualization();
        } catch (error) {
            console.warn('Visualizador no soportado:', error);
        }
    }
    
    startVisualization() {
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const width = this.visualizer.width;
        const height = this.visualizer.height;
        const barWidth = (width / bufferLength) * 2.5;
        
        const draw = () => {
            this.animationFrame = requestAnimationFrame(draw);
            
            this.analyser.getByteFrequencyData(dataArray);
            
            this.visualizerCtx.fillStyle = 'rgba(26, 26, 46, 0.3)';
            this.visualizerCtx.fillRect(0, 0, width, height);
            
            let x = 0;
            const gradient = this.visualizerCtx.createLinearGradient(0, 0, width, 0);
            gradient.addColorStop(0, '#fa195b');
            gradient.addColorStop(0.5, '#990040');
            gradient.addColorStop(1, '#fa195b');
            
            this.visualizerCtx.fillStyle = gradient;
            
            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * height;
                
                this.visualizerCtx.fillRect(
                    x,
                    height - barHeight,
                    barWidth,
                    barHeight
                );
                
                x += barWidth + 1;
            }
        };
        
        draw();
    }
    
    async togglePlay() {
        if (this.isPlaying) {
            this.pause();
        } else {
            await this.play();
        }
    }
    
    async play() {
        try {
            // Inicializar contexto de audio si es necesario
            if (this.audioContext && this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            await this.audio.play();
            this.isPlaying = true;
            this.updatePlayButton(true);
            this.playerCard.classList.add('playing');
            this.updateConnectionStatus('connected', 'Reproduciendo');
            this.showToast('🎶 Reproduciendo en vivo');
        } catch (error) {
            console.error('Error al reproducir:', error);
            this.showToast('❌ Error al reproducir. Intentando reconectar...');
            this.scheduleRetry();
        }
    }
    
    pause() {
        this.audio.pause();
        this.isPlaying = false;
        this.updatePlayButton(false);
        this.playerCard.classList.remove('playing');
        this.updateConnectionStatus('paused', 'Pausado');
    }
    
    updatePlayButton(playing) {
        if (playing) {
            this.playIcon.style.display = 'none';
            this.pauseIcon.style.display = 'block';
        } else {
            this.playIcon.style.display = 'block';
            this.pauseIcon.style.display = 'none';
        }
    }
    
    handleVolumeChange() {
        const volume = this.volumeSlider.value / 100;
        this.audio.volume = volume;
        this.updateVolumeUI();
        
        if (volume === 0) {
            this.isMuted = true;
        } else {
            this.isMuted = false;
        }
    }
    
    toggleMute() {
        if (this.isMuted) {
            this.audio.volume = this.previousVolume / 100;
            this.volumeSlider.value = this.previousVolume;
            this.isMuted = false;
        } else {
            this.previousVolume = this.volumeSlider.value;
            this.audio.volume = 0;
            this.volumeSlider.value = 0;
            this.isMuted = true;
        }
        this.updateVolumeUI();
    }
    
    toggleVolumeSlider() {
        const container = document.getElementById('volumeSliderContainer');
        container.style.display = container.style.display === 'none' ? 'flex' : 'none';
    }
    
    updateVolumeUI() {
        const volume = this.volumeSlider.value;
        this.volumeValue.textContent = volume + '%';
    }
    
    updateConnectionStatus(status, text) {
        this.statusText.textContent = text;
        this.statusDot.className = 'status-dot ' + status;
    }
    
    onPlaying() {
        this.updateConnectionStatus('connected', 'En vivo');
        this.retryCount = 0;
    }
    
    onPause() {
        if (!this.isPlaying) {
            this.updateConnectionStatus('paused', 'Pausado');
        }
    }
    
    onBuffering() {
        this.updateConnectionStatus('buffering', 'Cargando...');
    }
    
    onCanPlay() {
        this.updateConnectionStatus('connected', 'Listo para reproducir');
    }
    
    onError(e) {
        console.error('Error de streaming:', e);
        this.updateConnectionStatus('error', 'Error de conexión');
        this.scheduleRetry();
    }
    
    onEnded() {
        this.updateConnectionStatus('error', 'Stream finalizado');
        this.scheduleRetry();
    }
    
    scheduleRetry() {
        if (this.retryCount < CONFIG.MAX_RETRIES) {
            this.retryCount++;
            this.showToast(`🔄 Reconectando... (Intento ${this.retryCount}/${CONFIG.MAX_RETRIES})`);
            
            setTimeout(() => {
                this.audio.load();
                if (this.isPlaying) {
                    this.play();
                }
            }, CONFIG.RETRY_DELAY);
        } else {
            this.showToast('❌ No se pudo conectar. Verifica tu conexión.');
            this.updateConnectionStatus('error', 'Sin conexión');
        }
    }
    
    attemptAutoplay() {
        // Intentar reproducción automática (puede ser bloqueada por el navegador)
        this.play().catch(() => {
            this.showToast('👆 Presiona play para comenzar a escuchar');
            this.updateConnectionStatus('paused', 'Listo para reproducir');
        });
    }

    setupFirstInteraction() {
        const startOnInteraction = async () => {
            if (!this.isPlaying) {
                await this.play().catch(e => console.log("Aún bloqueado:", e));
            }
            // Eliminar los listeners después de la primera interacción exitosa
            window.removeEventListener('click', startOnInteraction);
            window.removeEventListener('touchstart', startOnInteraction);
            window.removeEventListener('keydown', startOnInteraction);
        };

        window.addEventListener('click', startOnInteraction);
        window.addEventListener('touchstart', startOnInteraction);
        window.addEventListener('keydown', startOnInteraction);
    }
    
    showToast(message, duration = 3000) {
        this.toast.textContent = message;
        this.toast.classList.add('show');
        
        setTimeout(() => {
            this.toast.classList.remove('show');
        }, duration);
    }
    
    createParticles() {
        const container = document.getElementById('particles');
        const particleCount = 15;
        
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            const shapes = ['circle', 'ring', 'square'];
            const shapeClass = shapes[Math.floor(Math.random() * shapes.length)];
            particle.className = `particle ${shapeClass}`;
            
            const size = Math.random() * 200 + 50;
            particle.style.width = size + 'px';
            particle.style.height = size + 'px';
            particle.style.left = Math.random() * 100 + '%';
            particle.style.top = Math.random() * 100 + '%';
            particle.style.animationDelay = Math.random() * 10 + 's';
            particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
            
            container.appendChild(particle);
        }
    }

    setupMetadata() {
        if (!CONFIG.MOUNT_POINT) return;

        const apiUrl = `https://api.zeno.fm/mounts/metadata/subscribe/${CONFIG.MOUNT_POINT}`;

        try {
            if (this.evtSource) {
                this.evtSource.close();
            }

            this.evtSource = new EventSource(apiUrl);

            this.evtSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.updateMetadataUI(data);
                } catch (e) {
                    console.error('Error al parsear metadata:', e);
                }
            };

            this.evtSource.onerror = (err) => {
                console.error('Error en EventSource (Metadata):', err);
                // Intentar reconectar después de un tiempo
                setTimeout(() => this.setupMetadata(), 30000);
            };

        } catch (error) {
            console.error('Error al configurar metadata:', error);
        }
    }

    updateMetadataUI(data) {
        // Zeno.fm devuelve campos como data.title o el stream info formateado
        // Estructura común: { streamTitle: "Artista - Canción" } o campos separados
        
        let title = data.streamTitle || "";
        let artist = CONFIG.STATION_NAME;

        if (title.includes(" - ")) {
            const parts = title.split(" - ");
            artist = parts[0].trim();
            title = parts[1].trim();
        }

        if (title) {
            this.trackTitle.textContent = title;
            this.trackArtist.textContent = artist;
            
            // Actualizar el título de la pestaña del navegador
            document.title = `${title} - ${CONFIG.STATION_NAME}`;
        }
    }

    setupEq() {
        this.eqCard = document.getElementById('eqCard');
        this.eqDropdown = document.getElementById('eqDropdown');
        this.currentEqText = document.getElementById('current-eq');
        this.presetBtns = document.querySelectorAll('.eq-preset-btn');
        
        this.presets = {
            'Normal': { low: 0, mid: 0, high: 0 },
            'Graves': { low: 6, mid: -1, high: 1 },
            'Voces': { low: -2, mid: 4, high: 1 },
            'Electrónica': { low: 5, mid: -2, high: 4 }
        };
        
        if (!this.eqCard) return;
        
        this.eqCard.addEventListener('click', (e) => {
            if (!e.target.classList.contains('eq-preset-btn')) {
                this.eqDropdown.classList.toggle('show');
            }
        });
        
        document.addEventListener('click', (e) => {
            if (!this.eqCard.contains(e.target)) {
                this.eqDropdown.classList.remove('show');
            }
        });
        
        this.presetBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const presetName = btn.getAttribute('data-preset');
                this.applyEqPreset(presetName);
                
                this.presetBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                this.currentEqText.textContent = btn.textContent;
                this.eqDropdown.classList.remove('show');
                this.showToast(`🎛️ Ecualizador: ${btn.textContent}`);
            });
        });
    }
    
    applyEqPreset(presetName) {
        if (!this.lowEq || !this.midEq || !this.highEq) return;
        
        const preset = this.presets[presetName];
        if (preset) {
            // Suavizar la transición del audio para que no haya clips
            const now = this.audioContext.currentTime;
            this.lowEq.gain.setTargetAtTime(preset.low, now, 0.1);
            this.midEq.gain.setTargetAtTime(preset.mid, now, 0.1);
            this.highEq.gain.setTargetAtTime(preset.high, now, 0.1);
        }
    }
}

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new RadioPlayer();
    
    // Clear caches on load to ensure instant updates (PWA refresh)
    if ('caches' in window) {
        caches.keys().then(keys => {
            keys.forEach(key => caches.delete(key));
        });
    }

    // Registrar Service Worker para PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log('Service Worker registrado'))
            .catch(err => console.log('Error en Service Worker:', err));
    }
});

// PWA Install Prompt Logic
let deferredPrompt;
const installPopup = document.getElementById('installPopup');
const installBtnPopup = document.getElementById('installBtnPopup');
const closeInstallPopup = document.getElementById('closeInstallPopup');
const floatingInstallBtn = document.getElementById('floatingInstallBtn');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    if (!sessionStorage.getItem('installDismissed')) {
        installPopup.style.display = 'flex';
        setTimeout(() => installPopup.classList.add('show'), 100);
    } else {
        floatingInstallBtn.classList.add('show');
    }
});

const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    installPopup.classList.remove('show');
    floatingInstallBtn.classList.remove('show');
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    
    if (outcome !== 'accepted') {
        floatingInstallBtn.classList.add('show');
    }
};

installBtnPopup.addEventListener('click', handleInstall);
floatingInstallBtn.addEventListener('click', handleInstall);

closeInstallPopup.addEventListener('click', () => {
    installPopup.classList.remove('show');
    setTimeout(() => {
        installPopup.style.display = 'none';
        floatingInstallBtn.classList.add('show');
    }, 400);
    sessionStorage.setItem('installDismissed', 'true');
});

window.addEventListener('appinstalled', () => {
    installPopup.style.display = 'none';
    floatingInstallBtn.classList.remove('show');
    deferredPrompt = null;
});