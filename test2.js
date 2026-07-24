        let isModalOpen = false;
        
        function toggleFullScreen(elem) {
            if (!document.fullscreenElement) {
                elem.requestFullscreen().catch(err => {
                    console.warn(`Error attempting to enable fullscreen: ${err.message}`);
                });
            } else {
                document.exitFullscreen();
            }
        }
        
        function openAuraModal(url) {
            isModalOpen = true;
            const modal = document.getElementById('aura-modal');
            const content = document.getElementById('aura-modal-content');
            modal.style.display = 'flex';
            void modal.offsetWidth;
            modal.style.opacity = '1';
            
            content.classList.remove('portal-close');
            content.classList.add('portal-open');
            
            const player = document.getElementById('aura-player');
            const iframe = document.getElementById('aura-iframe');
            
            const isHtml = url && (url.endsWith('.html') || url.endsWith('.htm'));
            
            if (isHtml) {
                if (player) { player.pause(); player.style.display = 'none'; }
                if (iframe) {
                    iframe.src = url;
                    iframe.style.display = 'block';
                    // Si no es musica.html, usamos formato documento cuadrado normal
                    if (!url.toLowerCase().includes('musica.html')) {
                        content.classList.add('is-document');
                    } else {
                        // Si es musica.html, usamos el nuevo formato cuadrado con la animacion circular
                        content.classList.add('is-music');
                    }
                }
            } else {
                content.classList.remove('is-document');
                content.classList.remove('is-music');
                if (iframe) iframe.style.display = 'none';
                if (player) {
                    player.style.display = 'block';
                    if (fadeInterval) {
                        clearInterval(fadeInterval);
                        fadeInterval = null;
                    }
                    if (url && player.src !== url) {
                        player.src = url;
                        player.load();
                    }
                    player.muted = false;
                    player.volume = 1.0;
                    const playPromise = player.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(error => {
                            console.warn("Autoplay prevenido por el navegador:", error);
                        });
                    }
                }
            }
        }

        let fadeInterval = null;

        function closeAuraModal() {
            isModalOpen = false;
            const modal = document.getElementById('aura-modal');
            const content = document.getElementById('aura-modal-content');
            
            content.classList.remove('portal-open');
            content.classList.add('portal-close');
            
            modal.style.opacity = '0';
            
            const player = document.getElementById('aura-player');
            const iframe = document.getElementById('aura-iframe');
            
            // Note: The portal-close animation is handled by CSS for .is-music

            if (player && !player.paused && player.style.display !== 'none') {
                if (fadeInterval) clearInterval(fadeInterval);
                let vol = player.volume;
                fadeInterval = setInterval(() => {
                    vol -= 0.05;
                    if (vol > 0) {
                        player.volume = vol;
                    } else {
                        player.volume = 0;
                        clearInterval(fadeInterval);
                    }
                }, 75);
            }

            setTimeout(() => {
                modal.style.display = 'none';
                if (player) {
                    player.pause();
                    player.currentTime = 0;
                }
                if (iframe) {
                    iframe.src = ""; // Stop HTML processing
                }
            }, 2000);
        }
    </script>
    <script>
        // Configuración base de Active Theory / Three.js style
        const scene = new THREE.Scene();
        // Niebla para dar profundidad al fondo
        scene.fog = new THREE.FogExp2(0x0a0515, 0.0008);

        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 10000);
        camera.position.z = 1200;


        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);

        // Fullscreen toggle en doble click
        document.getElementById('aura-player').addEventListener('dblclick', function() { toggleFullScreen(this); });

        // Variables de ratón
        let mouseX = 0;
        let mouseY = 0;
        let normMouseX = 0;
        let normMouseY = 0;
        let targetX = 0;
        let targetY = 0;
        const windowHalfX = window.innerWidth / 2;
        const windowHalfY = window.innerHeight / 2;
        
        const planetInfo = document.getElementById('planet-info');
        const infoTitle = document.getElementById('info-title');
        const infoDesc = document.getElementById('info-desc');
        
        // Variables para la "Velocidad Láser"
        let isWarpSpeed = false;
        let warpTimer = 0;
        let currentSpeed = 1;
        let targetSpeed = 1;
        let cameraBaseX = 0;
        let cameraBaseY = 0;
        let cameraBaseZ = 1200;
        let fovTarget = 75;
        
        let warpTargetX = 0;
        let warpTargetY = 0;
        let warpTargetZ = 1200;

        document.addEventListener('mousemove', onDocumentMouseMove);
        document.addEventListener('touchstart', onDocumentTouchStart, {passive: true});
        document.addEventListener('touchmove', onDocumentTouchMove, {passive: true});
        
        let pendingWorldIndex = -1;
        
        // --- MOTOR DE AUDIO PROCEDURAL (Web Audio API) ---
        let audioCtx;
        let isAudioInit = false;

        function initAudio() {
            if (isAudioInit) return;
            isAudioInit = true;
            
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContext();
        }
        
        function updateAudioForWorld(w) {
            // Se han silenciado los ruidos de fondo constantes
        }

        function playWarpSound(dur) {
            if (!audioCtx) return;
            const t = audioCtx.currentTime;
            
            const sweepOsc = audioCtx.createOscillator();
            const sweepGain = audioCtx.createGain();
            
            sweepOsc.type = 'sine';
            sweepOsc.frequency.setValueAtTime(1200, t);
            sweepOsc.frequency.exponentialRampToValueAtTime(40, t + dur);
            
            sweepGain.gain.setValueAtTime(0, t);
            sweepGain.gain.linearRampToValueAtTime(0.3, t + 0.1);
            sweepGain.gain.exponentialRampToValueAtTime(0.01, t + dur);
            
            sweepOsc.connect(sweepGain);
            sweepGain.connect(audioCtx.destination);
            
            sweepOsc.start(t);
            sweepOsc.stop(t + dur);
        }

        let activeNeighbors = [];
        let anchorPlanet = null; // Planeta central de la vista

        function triggerDirectionalJump(direction) {
            if (isWarpSpeed) return;
            
            const currW = worldPalettes[currentWorld];
            const currCoords = getPlanetCoords(currW);
            
            let distances = [];
            for (let i = 0; i < worldPalettes.length; i++) {
                if (i === currentWorld) continue;
                const c = getPlanetCoords(worldPalettes[i]);
                const dist = Math.sqrt(Math.pow(c.x - currCoords.x, 2) + Math.pow(c.y - currCoords.y, 2) + Math.pow(c.z - currCoords.z, 2));
                distances.push({ idx: i, dist: dist, coords: c });
            }
            distances.sort((a, b) => a.dist - b.dist);
            
            // 1. Encontrar el planeta más cercano en la dirección indicada
            let filtered = distances;
            if (direction === 'up') filtered = distances.filter(d => d.coords.y > currCoords.y);
            if (direction === 'down') filtered = distances.filter(d => d.coords.y < currCoords.y);
            if (direction === 'right') filtered = distances.filter(d => d.coords.x > currCoords.x);
            if (direction === 'left') filtered = distances.filter(d => d.coords.x < currCoords.x);
            
            if (filtered.length === 0) filtered = distances;

            // El ancla es el objetivo principal de este salto
            const anchor = filtered[0];
            anchorPlanet = anchor;

            // 2. Tomar el ancla y hasta 3 planetas más que estén cerca del ancla en el espacio 3D
            let anchorDistances = [];
            for (let i = 0; i < distances.length; i++) {
                const p = distances[i];
                if (p.idx === anchor.idx) continue;
                const distToAnchor = Math.sqrt(Math.pow(p.coords.x - anchor.coords.x, 2) + Math.pow(p.coords.y - anchor.coords.y, 2) + Math.pow(p.coords.z - anchor.coords.z, 2));
                anchorDistances.push({ ...p, distToAnchor });
            }
            anchorDistances.sort((a, b) => a.distToAnchor - b.distToAnchor);
            
            // Los vecinos activos serán el ancla + los 3 más cercanos al ancla
            activeNeighbors = [anchor, ...anchorDistances.slice(0, 3)];

            warpTargetX = 0; warpTargetY = 0; 
            warpTargetZ = 3500; 

            document.getElementById('ui').style.opacity = '0';

            isWarpSpeed = true;
            warpTimer = 3.5; 
            alternativePortals.forEach(p => p.mesh.visible = false);
            document.querySelectorAll('.planet-term').forEach(el => el.style.display = 'none');
            playWarpSound(3.5);
        }

        function triggerJump() {
            let nx = normMouseX; // -1 a 1 (Izquierda a Derecha)
            let ny = normMouseY; // -1 a 1 (Abajo a Arriba)
            
            // Calculamos la distancia para definir las 6 zonas de la pantalla
            let maxDist = Math.max(Math.abs(nx), Math.abs(ny));
            let minDist = Math.min(Math.abs(nx), Math.abs(ny));

            if (maxDist < 0.25) {
                triggerDirectionalJump('center');
            } else if (minDist > 0.75) {
                triggerDirectionalJump('edges');
            } else {
                if (Math.abs(nx) > Math.abs(ny)) {
                    if (nx > 0) triggerDirectionalJump('right');
                    else triggerDirectionalJump('left');
                } else {
                    if (ny > 0) triggerDirectionalJump('up');
                    else triggerDirectionalJump('down');
                }
            }
        }

        document.addEventListener('dblclick', (e) => {
            if (isModalOpen) return;
            if (document.getElementById('game-map').style.display === 'flex') return;
            initAudio();
            triggerJump();
        });

        let keyBuffer = '';
        let terminalState = 'normal';
        let pendingPlanetData = null;
        let editingPlanetId = -1;
        const editFields = ['name', 'description', 'type'];
        let currentEditFieldIndex = 0;

        function openTerminal() {
            document.getElementById('game-terminal').classList.add('terminal-open');
            const input = document.getElementById('terminal-input');
            input.value = '';
            input.focus();
            terminalState = 'normal';
            input.type = 'text';
            const out = document.getElementById('terminal-output');
            out.innerHTML = `<div>SISTEMA DE NAVEGACIÓN ESTELAR (BASH)</div><div>========================================</div>`;
            out.innerHTML += `<div>(Escribe 'help' o 'ayuda' para ver los comandos)</div><br/>`;
            out.scrollTop = out.scrollHeight;
        }

        document.getElementById('close-terminal').addEventListener('click', () => {
            document.getElementById('game-terminal').classList.remove('terminal-open');
        });

        document.getElementById('terminal-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const rawVal = e.target.value.trim();
                const val = rawVal.toLowerCase();
                e.target.value = '';
                if (val === '') {
                    if (terminalState === 'normal') return;
                    // if empty while awaiting password, do nothing and return
                }
                
                const out = document.getElementById('terminal-output');
                
                if (terminalState === 'awaiting_password') {
                    out.innerHTML += `<div>> ${'*'.repeat(rawVal.length)}</div>`;
                    const password = rawVal;
                    
                    out.innerHTML += `<div>Autenticando y guardando en servidor...</div>`;
                    out.scrollTop = out.scrollHeight;
                    
                    const endpoint = pendingPlanetData ? '/api/mkplaneta' : '/api/updateplanets';
                    const bodyData = pendingPlanetData 
                        ? { password: password, planet: pendingPlanetData }
                        : { password: password, planets: worldPalettes };

                    fetch(endpoint, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(bodyData)
                    }).then(res => res.json()).then(data => {
                        if (data.status === 'ok') {
                            if (pendingPlanetData) {
                                worldPalettes.push(pendingPlanetData);
                                const totalWorlds = worldPalettes.length;
                                for (let i = 0; i < totalWorlds; i++) {
                                    navMap[i] = {
                                        right: (i + 1) % totalWorlds,
                                        left: (i - 1 + totalWorlds) % totalWorlds,
                                        up: (i + Math.floor(totalWorlds / 2)) % totalWorlds,
                                        down: (i - Math.floor(totalWorlds / 2) + totalWorlds) % totalWorlds,
                                        center: (i + 2) % totalWorlds,
                                        edges: (i - 2 + totalWorlds) % totalWorlds
                                    };
                                }
                                out.innerHTML += `<div>¡Planeta [${worldPalettes.length-1}] ${pendingPlanetData.name} guardado PERMANENTEMENTE!</div>`;
                            } else {
                                out.innerHTML += `<div>¡Planeta modificado y guardado PERMANENTEMENTE!</div>`;
                            }
                        } else {
                            out.innerHTML += `<div>Acceso denegado o error: ${data.error}</div>`;
                        }
                        pendingPlanetData = null;
                        out.scrollTop = out.scrollHeight;
                    }).catch(err => {
                        out.innerHTML += `<div>Error de conexión. ¿Está el servidor Python activo?</div>`;
                        pendingPlanetData = null;
                        out.scrollTop = out.scrollHeight;
                    });

                    terminalState = 'normal';
                    document.getElementById('terminal-input').type = 'text';
                    return;
                } else if (terminalState === 'awaiting_edit_decision') {
                    out.innerHTML += `<div>> ${rawVal}</div>`;
                    if (val === 'y' || val === 's') {
                        out.innerHTML += `<div>Introduce nuevo valor para '${editFields[currentEditFieldIndex]}':</div>`;
                        terminalState = 'awaiting_edit_value';
                    } else if (val === 'n') {
                        currentEditFieldIndex++;
                        if (currentEditFieldIndex < editFields.length) {
                            out.innerHTML += `<div>¿Quieres editar el campo '${editFields[currentEditFieldIndex]}'? (y/n)</div>`;
                        } else {
                            pendingPlanetData = null;
                            out.innerHTML += `<div>REQUIERE AUTORIZACIÓN: Introduce contraseña de administrador para confirmar cambios:</div>`;
                            terminalState = 'awaiting_password';
                            document.getElementById('terminal-input').type = 'password';
                        }
                    } else {
                        out.innerHTML += `<div>Responde 'y' (sí) o 'n' (no).</div>`;
                    }
                    out.scrollTop = out.scrollHeight;
                    return;
                } else if (terminalState === 'awaiting_edit_value') {
                    out.innerHTML += `<div>> ${rawVal}</div>`;
                    worldPalettes[editingPlanetId][editFields[currentEditFieldIndex]] = rawVal;
                    out.innerHTML += `<div>Campo '${editFields[currentEditFieldIndex]}' actualizado a '${rawVal}'.</div>`;
                    currentEditFieldIndex++;
                    if (currentEditFieldIndex < editFields.length) {
                        out.innerHTML += `<div>¿Quieres editar el campo '${editFields[currentEditFieldIndex]}'? (y/n)</div>`;
                        terminalState = 'awaiting_edit_decision';
                    } else {
                        pendingPlanetData = null;
                        out.innerHTML += `<div>REQUIERE AUTORIZACIÓN: Introduce contraseña de administrador para confirmar cambios:</div>`;
                        terminalState = 'awaiting_password';
                        document.getElementById('terminal-input').type = 'password';
                    }
                    out.scrollTop = out.scrollHeight;
                    return;
                }

                out.innerHTML += `<div>> ${rawVal}</div>`;
                
                if (val === 'ls' || val === 'lista') {
                    out.innerHTML += `<div>PLANETAS DISPONIBLES:</div>`;
                    worldPalettes.forEach((w, i) => {
                        const cx = (w.bg % 999).toString().padStart(3, '0');
                        const cy = (w.c1 % 999).toString().padStart(3, '0');
                        const cz = (w.c2 % 999).toString().padStart(3, '0');
                        out.innerHTML += `<div>[${i}] ${w.name.padEnd(20, ' ')} - X:${cx} Y:${cy} Z:${cz}</div>`;
                    });
                } else if (val === 'help' || val === 'ayuda') {
                    out.innerHTML += `<div>================ COMANDOS DE NAVEGACIÓN ================</div>`;
                    out.innerHTML += `<div>  ls / lista         - Muestra el directorio de planetas descubiertos</div>`;
                    out.innerHTML += `<div>  cat / view [id]    - Inspecciona los datos detallados de un planeta (ej: cat 0)</div>`;
                    out.innerHTML += `<div>  viajar / jump [id] - Inicia un salto hiperespacial al planeta indicado</div>`;
                    out.innerHTML += `<div>  exit / salir       - Cierra esta terminal de comandos</div>`;
                    out.innerHTML += `<div><br/>================ COMANDOS DE INGENIERÍA ================</div>`;
                    out.innerHTML += `<div>  mkplaneta-[nombre]                   - Crea un mundo nuevo (ej: mkplaneta-Zion)</div>`;
                    out.innerHTML += `<div>  edit [id]                            - Editor interactivo de campos del planeta</div>`;
                    out.innerHTML += `<div>  add-link [id] [url] [nombre_botón]   - Añade un nuevo botón de transmisión/vídeo</div>`;
                    out.innerHTML += `<div>  rm-link [id] [índice]                - Borra un botón (usa 'cat' para ver índices)</div>`;
                    out.innerHTML += `<div>  set-desc [id] [nueva_descripción...] - Modifica la descripción de un planeta</div>`;
                    out.innerHTML += `<div>  set-type [id] [tipo]                 - Cambia el ecosistema (neon, fire, toxic, ice, terra, aura)</div>`;
                } else if (val === 'exit' || val === 'salir') {
                    document.getElementById('game-terminal').classList.remove('terminal-open');
                } else if (val.startsWith('cat ') || val.startsWith('view ') || val.startsWith('ver ')) {
                    const id = parseInt(val.split(' ')[1]);
                    if (!isNaN(id) && id >= 0 && id < worldPalettes.length) {
                        const w = worldPalettes[id];
                        let txt = `ID: ${id}\nNombre: ${w.name}\nTipo: ${w.type}\nDesc: ${w.description || "N/A"}\nColor Base: #${w.bg.toString(16)}`;
                        if (w.trans_url) txt += `\nTransmisión (Legacy): ${w.trans_url}`;
                        if (w.reg_url) txt += `\nRegistro (Legacy): ${w.reg_url}`;
                        if (w.links && w.links.length > 0) {
                            txt += `\nBotones (Links):`;
                            w.links.forEach((link, idx) => {
                                txt += `\n  [${idx}] "${link.label}" -> ${link.url}`;
                            });
                        }
                        out.innerHTML += `<div style="white-space: pre-wrap;">${txt}</div>`;
                    } else {
                        out.innerHTML += `<div>Error: Planeta no encontrado.</div>`;
                    }
                } else if (val.startsWith('mkplaneta-')) {
                    const nombre = rawVal.substring(10).toUpperCase().trim();
                    if (nombre) {
                        pendingPlanetData = {
                            name: nombre,
                            bg: Math.floor(Math.random()*0xffffff),
                            c1: Math.floor(Math.random()*0xffffff),
                            c2: Math.floor(Math.random()*0xffffff),
                            c3: Math.floor(Math.random()*0xffffff),
                            type: ['neon','fire','toxic','ice','terra'][Math.floor(Math.random()*5)],
                            description: "Planeta generado por consola.",
                            hasTransmission: false
                        };
                        out.innerHTML += `<div>Iniciando protocolo de creación para ${nombre}...</div>`;
                        out.innerHTML += `<div>REQUIERE AUTORIZACIÓN: Introduce contraseña de administrador:</div>`;
                        terminalState = 'awaiting_password';
                        document.getElementById('terminal-input').type = 'password';
                    } else {
                        out.innerHTML += `<div>Error: Faltan argumentos. Usa mkplaneta-[nombre].</div>`;
                    }
                } else if (val.startsWith('add-link ')) {
                    // add-link 2 assets/video.mp4 Ver Camara 1
                    const args = rawVal.split(' ');
                    if (args.length >= 4) {
                        const id = parseInt(args[1]);
                        const url = args[2];
                        const label = args.slice(3).join(' ');
                        
                        if (!isNaN(id) && id >= 0 && id < worldPalettes.length) {
                            if (!worldPalettes[id].links) worldPalettes[id].links = [];
                            worldPalettes[id].links.push({ url: url, label: label });
                            out.innerHTML += `<div>Añadiendo botón "${label}" en ${worldPalettes[id].name}...</div>`;
                            
                            pendingPlanetData = null; 
                            out.innerHTML += `<div>REQUIERE AUTORIZACIÓN: Introduce contraseña de administrador:</div>`;
                            terminalState = 'awaiting_password';
                            document.getElementById('terminal-input').type = 'password';
                        } else {
                            out.innerHTML += `<div>Error: Planeta no encontrado.</div>`;
                        }
                    } else {
                        out.innerHTML += `<div>Error: Argumentos inválidos. Uso: add-link [id] [url] [Nombre del botón]</div>`;
                    }
                } else if (val.startsWith('rm-link ')) {
                    const args = rawVal.split(' ');
                    if (args.length === 3) {
                        const id = parseInt(args[1]);
                        const linkIdx = parseInt(args[2]);
                        
                        if (!isNaN(id) && id >= 0 && id < worldPalettes.length) {
                            if (worldPalettes[id].links && !isNaN(linkIdx) && linkIdx >= 0 && linkIdx < worldPalettes[id].links.length) {
                                const deletedLabel = worldPalettes[id].links[linkIdx].label;
                                worldPalettes[id].links.splice(linkIdx, 1);
                                out.innerHTML += `<div>Botón "${deletedLabel}" eliminado en ${worldPalettes[id].name}...</div>`;
                                
                                pendingPlanetData = null; 
                                out.innerHTML += `<div>REQUIERE AUTORIZACIÓN: Introduce contraseña de administrador:</div>`;
                                terminalState = 'awaiting_password';
                                document.getElementById('terminal-input').type = 'password';
                            } else {
                                out.innerHTML += `<div>Error: Índice de botón inválido. (Usa cat para ver el planeta)</div>`;
                            }
                        } else {
                            out.innerHTML += `<div>Error: Planeta no encontrado.</div>`;
                        }
                    } else {
                        out.innerHTML += `<div>Error: Argumentos inválidos. Uso: rm-link [id] [indice]</div>`;
                    }
                } else if (val.startsWith('set-desc ')) {
                    const args = rawVal.split(' ');
                    if (args.length >= 3) {
                        const id = parseInt(args[1]);
                        const desc = args.slice(2).join(' ');
                        if (!isNaN(id) && id >= 0 && id < worldPalettes.length) {
                            worldPalettes[id].description = desc;
                            out.innerHTML += `<div>Descripción de ${worldPalettes[id].name} actualizada...</div>`;
                            
                            pendingPlanetData = null; 
                            out.innerHTML += `<div>REQUIERE AUTORIZACIÓN: Introduce contraseña de administrador:</div>`;
                            terminalState = 'awaiting_password';
                            document.getElementById('terminal-input').type = 'password';
                        } else {
                            out.innerHTML += `<div>Error: Planeta no encontrado.</div>`;
                        }
                    } else {
                        out.innerHTML += `<div>Error: Uso incorrecto. Ejemplo: set-desc 0 Este es un mundo letal</div>`;
                    }
                } else if (val.startsWith('set-type ')) {
                    const args = rawVal.split(' ');
                    if (args.length === 3) {
                        const id = parseInt(args[1]);
                        const newType = args[2].toLowerCase();
                        const validTypes = ['neon', 'fire', 'toxic', 'ice', 'terra', 'aura'];
                        
                        if (!isNaN(id) && id >= 0 && id < worldPalettes.length) {
                            if (validTypes.includes(newType)) {
                                worldPalettes[id].type = newType;
                                out.innerHTML += `<div>Ecosistema de ${worldPalettes[id].name} mutado a '${newType}'...</div>`;
                                
                                pendingPlanetData = null; 
                                out.innerHTML += `<div>REQUIERE AUTORIZACIÓN: Introduce contraseña de administrador:</div>`;
                                terminalState = 'awaiting_password';
                                document.getElementById('terminal-input').type = 'password';
                            } else {
                                out.innerHTML += `<div>Error: Tipo inválido. Usa uno de: ${validTypes.join(', ')}</div>`;
                            }
                        } else {
                            out.innerHTML += `<div>Error: Planeta no encontrado.</div>`;
                        }
                    } else {
                        out.innerHTML += `<div>Error: Uso incorrecto. Ejemplo: set-type 0 toxic</div>`;
                    }
                } else if (val.startsWith('viajar ') || val.startsWith('jump ')) {
                    const id = parseInt(val.split(' ')[1]);
                    if (!isNaN(id) && id >= 0 && id < worldPalettes.length) {
                        out.innerHTML += `<div>Iniciando salto a ${worldPalettes[id].name}...</div>`;
                        setTimeout(() => {
                            document.getElementById('game-terminal').classList.remove('terminal-open');
                            changeWorld(id);
                        }, 500);
                    } else {
                        out.innerHTML += `<div>Error: Destino desconocido.</div>`;
                    }
                } else if (val.startsWith('edit ')) {
                    const args = rawVal.split(' ');
                    if (args.length === 2) {
                        const id = parseInt(args[1]);
                        if (!isNaN(id) && id >= 0 && id < worldPalettes.length) {
                            editingPlanetId = id;
                            currentEditFieldIndex = 0;
                            out.innerHTML += `<div>Iniciando edición interactiva de planeta ${id} (${worldPalettes[id].name})...</div>`;
                            out.innerHTML += `<div>¿Quieres editar el campo '${editFields[currentEditFieldIndex]}'? (y/n)</div>`;
                            terminalState = 'awaiting_edit_decision';
                        } else {
                            out.innerHTML += `<div>Error: Planeta no encontrado o ID inválido.</div>`;
                        }
                    } else {
                        out.innerHTML += `<div>Error: Argumentos inválidos. Uso: edit [id]</div>`;
                    }
                } else {
                    out.innerHTML += `<div>Comando desconocido.</div>`;
                }
                out.scrollTop = out.scrollHeight;
            }
        });

        document.addEventListener('keydown', (event) => {
            initAudio();
            
            if (isModalOpen) {
                if (event.key === 'Escape') {
                    if (document.getElementById('aura-modal').style.display === 'flex') closeAuraModal();
                }
                return;
            }
            
            const term = document.getElementById('game-terminal');
            if (term.classList.contains('terminal-open')) {
                if (event.key === 'Escape') term.classList.remove('terminal-open');
                return;
            }
            
            const map = document.getElementById('game-map');
            if (map && map.style.display === 'flex') {
                if (event.key === 'Escape') closeMap();
                return;
            }

            keyBuffer += event.key.toLowerCase();
            if (keyBuffer.length > 4) keyBuffer = keyBuffer.slice(-4);
            if (keyBuffer === 'term') {
                event.preventDefault();
                openTerminal();
                keyBuffer = '';
                return;
            }
            if (keyBuffer.endsWith('map')) {
                event.preventDefault();
                openMap();
                keyBuffer = '';
                return;
            }

            if (isWarpSpeed) return;
            if (document.getElementById('game-map').style.display === 'flex') return;
            
            if (event.key === 'ArrowUp') triggerDirectionalJump('up');
            else if (event.key === 'ArrowDown') triggerDirectionalJump('down');
            else if (event.key === 'ArrowLeft') triggerDirectionalJump('left');
            else if (event.key === 'ArrowRight') triggerDirectionalJump('right');
        });

        // Generar un sistema de partículas (15,000 puntos)
        const geometry = new THREE.BufferGeometry();
        const particles = 15000;
        const positions = new Float32Array(particles * 3);
        const colors = new Float32Array(particles * 3);
        
        // Los mundos se cargan ahora desde el archivo externo planets.js
        
        let currentWorld = Math.floor(Math.random() * worldPalettes.length);
        let planetAssetsMap = {};
        
        fetch('/api/all_planet_assets?t=' + new Date().getTime())
            .then(res => {
                if (!res.ok) throw new Error('API not available, fallback to static JSON');
                return res.json();
            })
            .then(data => {
                planetAssetsMap = data;
                changeWorld(currentWorld, true); // Refresh to apply initial textures/buttons if ready
            })
            .catch(err => {
                console.log("Servidor local no detectado, usando planet_assets.json...");
                fetch('planet_assets.json')
                    .then(res => res.json())
                    .then(data => {
                        planetAssetsMap = data;
                        changeWorld(currentWorld, true);
                    })
                    .catch(e => console.error("Error cargando assets:", e));
            });
        function renderLinks(world) {
            const container = document.getElementById('aura-links');
            container.innerHTML = '';
            
            const normName = world.name.toLowerCase().replace(/ /g, '');
            const folderName = normName;
            const pAssets = planetAssetsMap[folderName];
            
            let hasLinks = false;
            let subContainersToAppend = [];
            
            if (pAssets && pAssets.files) {
                const files = pAssets.files;
                const folder = pAssets.folder;
                
                // HTML Files (Conoce X)
                const htmlFiles = files.filter(f => f.toLowerCase().endsWith('.html'));
                htmlFiles.sort();
                let musicMenuBtn = null;
                let musicSubContainer = null;
                let videoMenuBtn = null;
                let videoSubContainer = null;

                function closeAllSubmenus() {
                    if (musicMenuBtn && musicSubContainer) {
                        musicSubContainer.style.display = 'none';
                        musicMenuBtn.style.background = '';
                        musicMenuBtn.style.borderColor = '';
                        musicMenuBtn.style.boxShadow = '';
                        musicMenuBtn.style.color = '';
                        musicMenuBtn.style.transform = '';
                    }
                    if (videoMenuBtn && videoSubContainer) {
                        videoSubContainer.style.display = 'none';
                        videoMenuBtn.style.background = '';
                        videoMenuBtn.style.borderColor = '';
                        videoMenuBtn.style.boxShadow = '';
                        videoMenuBtn.style.color = '';
                        videoMenuBtn.style.transform = '';
                    }
                }

                // First add 'Conoce' (index.html)
                const indexFile = htmlFiles.find(f => f.toLowerCase() === 'index.html');
                if (indexFile) {
                    hasLinks = true;
                    const a = document.createElement('a');
                    a.className = 'aura-link';
                    a.href = '#';
                    a.innerText = `CONOCE ${world.name}`.toUpperCase();
                    a.onclick = (e) => { 
                        e.preventDefault();
                        closeAllSubmenus();
                        openAuraModal(`${folder}/${indexFile}`); 
                    };
                    container.appendChild(a);
                }

                const musicFiles = htmlFiles.filter(f => f.toLowerCase().startsWith('musica'));
                const otherHtmlFiles = htmlFiles.filter(f => !f.toLowerCase().startsWith('musica') && f.toLowerCase() !== 'index.html');

                if (musicFiles.length > 0) {
                    hasLinks = true;
                    const a = document.createElement('a');
                    a.className = 'aura-link';
                    a.href = '#';
                    const playIcon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="vertical-align: middle; margin-right: 4px; margin-bottom: 2px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
                    a.innerHTML = `${playIcon} SEÑAL DE AUDIO`;
                    
                    const subContainer = document.createElement('div');
                    subContainer.style.display = 'none';
                    subContainer.style.flexDirection = 'row';
                    subContainer.style.justifyContent = 'center';
                    subContainer.style.gap = '10px';
                    subContainer.style.marginTop = '10px';
                    subContainer.style.flexWrap = 'wrap';
                    subContainer.style.width = '100%';

                    musicMenuBtn = a;
                    musicSubContainer = subContainer;

                    a.onclick = (e) => {
                        e.preventDefault();
                        const isClosed = subContainer.style.display === 'none';
                        closeAllSubmenus();
                        if (isClosed) {
                            subContainer.style.display = 'flex';
                            a.style.background = 'rgba(0, 238, 255, 0.1)';
                            a.style.borderColor = '#00eeff';
                            a.style.boxShadow = 'inset 0 0 10px rgba(0, 238, 255, 0.4), 0 0 10px rgba(0, 238, 255, 0.2)';
                            a.style.color = '#00eeff';
                            a.style.transform = 'scale(0.96)';
                        } else {
                            a.style.background = '';
                            a.style.borderColor = '';
                            a.style.boxShadow = '';
                            a.style.color = '';
                            a.style.transform = '';
                        }
                    };

                    container.appendChild(a);
                    subContainersToAppend.push(subContainer);

                    musicFiles.forEach(hf => {
                        let name = hf.replace(/\.html$/i, '');
                        if (name.toLowerCase().startsWith('musica - ')) {
                            name = name.substring(9);
                        } else if (name.toLowerCase() === 'musica') {
                            name = 'Señal Principal';
                        }
                        
                        const subBtn = document.createElement('a');
                        subBtn.className = 'aura-link';
                        subBtn.style.fontSize = '0.8em';
                        subBtn.style.padding = '5px 10px';
                        subBtn.style.border = '2px solid transparent';
                        subBtn.style.backgroundImage = 'linear-gradient(rgba(0,0,0,0.8), rgba(0,0,0,0.8)), linear-gradient(90deg, #ff0055, #00eeff)';
                        subBtn.style.backgroundOrigin = 'border-box';
                        subBtn.style.backgroundClip = 'padding-box, border-box';
                        subBtn.style.color = '#fff';
                        subBtn.style.boxShadow = '0 0 10px rgba(0, 238, 255, 0.2)';
                        subBtn.href = '#';
                        subBtn.innerText = name.toUpperCase();
                        subBtn.onclick = (e) => {
                            e.preventDefault();
                            openAuraModal(`${folder}/${hf}`);
                        };
                        subContainer.appendChild(subBtn);
                    });
                }

                otherHtmlFiles.forEach((hf) => {
                    hasLinks = true;
                    const a = document.createElement('a');
                    a.className = 'aura-link';
                    a.href = '#';
                    a.innerText = hf.replace(/\.html$/i, '').toUpperCase();
                    a.onclick = (e) => { 
                        e.preventDefault(); 
                        closeAllSubmenus();
                        openAuraModal(`${folder}/${hf}`); 
                    };
                    container.appendChild(a);
                });
                
                // Videos (Transmisión)
                const videos = files.filter(f => f.toLowerCase().endsWith('.mp4') || f.toLowerCase().endsWith('.webm'));
                videos.sort();
                if (videos.length > 0) {
                    hasLinks = true;
                    const a = document.createElement('a');
                    a.className = 'aura-link';
                    a.href = '#';
                    const playIcon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="vertical-align: middle; margin-right: 4px; margin-bottom: 2px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
                    a.innerHTML = `${playIcon} SEÑAL DE VÍDEO`;
                    
                    const subContainer = document.createElement('div');
                    subContainer.style.display = 'none';
                    subContainer.style.flexDirection = 'row';
                    subContainer.style.justifyContent = 'center';
                    subContainer.style.gap = '10px';
                    subContainer.style.marginTop = '10px';
                    subContainer.style.flexWrap = 'wrap';
                    subContainer.style.width = '100%';

                    videoMenuBtn = a;
                    videoSubContainer = subContainer;

                    a.onclick = (e) => {
                        e.preventDefault();
                        const isClosed = subContainer.style.display === 'none';
                        closeAllSubmenus();
                        if (isClosed) {
                            subContainer.style.display = 'flex';
                            a.style.background = 'rgba(0, 238, 255, 0.1)';
                            a.style.borderColor = '#00eeff';
                            a.style.boxShadow = 'inset 0 0 10px rgba(0, 238, 255, 0.4), 0 0 10px rgba(0, 238, 255, 0.2)';
                            a.style.color = '#00eeff';
                            a.style.transform = 'scale(0.96)';
                        }
                    };

                    container.appendChild(a);
                    subContainersToAppend.push(subContainer);

                    videos.forEach((vid, i) => {
                        const subBtn = document.createElement('a');
                        subBtn.className = 'aura-link';
                        subBtn.style.fontSize = '0.8em';
                        subBtn.style.padding = '5px 10px';
                        subBtn.style.border = '2px solid transparent';
                        subBtn.style.backgroundImage = 'linear-gradient(rgba(0,0,0,0.8), rgba(0,0,0,0.8)), linear-gradient(90deg, #ff0055, #00eeff)';
                        subBtn.style.backgroundOrigin = 'border-box';
                        subBtn.style.backgroundClip = 'padding-box, border-box';
                        subBtn.style.color = '#fff';
                        subBtn.style.boxShadow = '0 0 10px rgba(0, 238, 255, 0.2)';
                        subBtn.href = '#';
                        subBtn.innerHTML = videos.length > 1 ? `${playIcon} SEÑAL ${i + 1}` : `${playIcon} SEÑAL ÚNICA`;
                        
                        subBtn.onclick = (e) => {
                            e.preventDefault();
                            openAuraModal(`${folder}/${vid}`);
                        };
                        subContainer.appendChild(subBtn);
                    });
                }
            } else {
                // Fallback estático (si no hay API o si la carpeta no existe)
                if (world.trans_url) {
                    hasLinks = true;
                    const a = document.createElement('a');
                    a.className = 'aura-link';
                    a.href = '#';
                    const playIcon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="vertical-align: middle; margin-right: 4px; margin-bottom: 2px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
                    a.innerHTML = `${playIcon} SEÑAL DE VÍDEO`;
                    a.onclick = (e) => { e.preventDefault(); openAuraModal(world.trans_url); };
                    container.appendChild(a);
                }
                if (world.reg_url) {
                    hasLinks = true;
                    const a = document.createElement('a');
                    a.className = 'aura-link';
                    a.href = '#';
                    const playIcon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="vertical-align: middle; margin-right: 4px; margin-bottom: 2px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
                    a.innerHTML = `${playIcon} REGISTRO`;
                    a.onclick = (e) => { e.preventDefault(); openAuraModal(world.reg_url); };
                    container.appendChild(a);
                }
                if (world.links && world.links.length > 0) {
                    world.links.forEach((link, index) => {
                        hasLinks = true;
                        const a = document.createElement('a');
                        a.className = 'aura-link';
                        a.href = '#';
                        a.innerText = link.label;
                        a.onclick = (e) => { e.preventDefault(); openAuraModal(link.url); };
                        container.appendChild(a);
                    });
                }
            }
            
            subContainersToAppend.forEach(sc => container.appendChild(sc));
            container.style.display = hasLinks ? 'flex' : 'none';
        }

        function getDarkenedHex(hex, factor = 0.15) {
            let r = (hex >> 16) & 255;
            let g = (hex >> 8) & 255;
            let b = hex & 255;
            r = Math.floor(r * factor);
            g = Math.floor(g * factor);
            b = Math.floor(b * factor);
            return (r << 16) | (g << 8) | b;
        }

        const initW = worldPalettes[currentWorld];
        document.getElementById('world-title').innerText = initW.name;
        document.getElementById('world-desc').innerText = initW.description || "LABORATORIO VISUAL";
        renderLinks(initW);
        
        const darkInitBg = getDarkenedHex(initW.bg, 0.15);
        document.body.style.backgroundColor = '#' + darkInitBg.toString(16).padStart(6, '0');
        scene.fog.color.setHex(darkInitBg);

        // Mapa de navegación (grafo topológico personalizado)
        const navMap = {};
        const totalWorlds = worldPalettes.length;
        for (let i = 0; i < totalWorlds; i++) {
            navMap[i] = {
                right: (i + 1) % totalWorlds,
                left: (i - 1 + totalWorlds) % totalWorlds,
                up: (i + Math.floor(totalWorlds / 2)) % totalWorlds,
                down: (i - Math.floor(totalWorlds / 2) + totalWorlds) % totalWorlds,
                center: (i + 2) % totalWorlds,
                edges: (i - 2 + totalWorlds) % totalWorlds
            };
        }
        
        // --- SECRETO: SECTOR OMEGA ---
        const SECRET_INDEX = worldPalettes.length;
        worldPalettes.push({
            name: "SECTOR OMEGA",
            description: "ANOMALÍA GRAVITACIONAL AISLANDO EL SECTOR. PELIGRO.",
            bg: 0xffffff,
            c1: 0x00ffff,
            c2: 0xff00ff,
            c3: 0xffff00,
            type: "neon",
            secret: true,
            trans_url: "",
            reg_url: ""
        });
        navMap[SECRET_INDEX] = {
            right: 0, left: 1, up: 2, down: 3, center: 0, edges: 1
        };
        
        let color1 = new THREE.Color(initW.c1);
        let color2 = new THREE.Color(initW.c2);
        let color3 = new THREE.Color(initW.c3);

        function getHexColor(num) {
            return '#' + num.toString(16).padStart(6, '0');
        }

        function createPlanetTexture(w) {
            const normName = w.name.toLowerCase().replace(/ /g, '');
            const pAssets = planetAssetsMap[normName];
            if (pAssets && pAssets.files) {
                const texFile = pAssets.files.find(f => f.toLowerCase().startsWith('textura.'));
                if (texFile) {
                    w.texture_url = `${pAssets.folder}/${texFile}`;
                }
            }

            if (w.texture_url) {
                const loader = new THREE.TextureLoader();
                const texture = loader.load(w.texture_url);
                texture.colorSpace = THREE.SRGBColorSpace || THREE.LinearSRGBColorSpace;
                return texture;
            }

            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            const ctx = canvas.getContext('2d');
            
            const bgStr = getHexColor(w.bg);
            const c1Str = getHexColor(w.c1);
            const c2Str = getHexColor(w.c2);
            const c3Str = getHexColor(w.c3);
            
            if (w.type === 'neon') {
                ctx.fillStyle = bgStr;
                ctx.fillRect(0,0,512,512);
                for(let i=0; i<300; i++) {
                    ctx.fillStyle = Math.random() > 0.5 ? c1Str : c2Str;
                    ctx.beginPath();
                    ctx.arc(Math.random()*512, Math.random()*512, Math.random()*15, 0, Math.PI*2);
                    ctx.fill();
                }
            } else if (w.type === 'fire') {
                const grad = ctx.createRadialGradient(256, 256, 0, 256, 256, 300);
                grad.addColorStop(0, c2Str);
                grad.addColorStop(1, bgStr);
                ctx.fillStyle = grad;
                ctx.fillRect(0,0,512,512);
                for(let i=0; i<150; i++) {
                    ctx.fillStyle = 'rgba(255,255,255,0.2)';
                    ctx.fillRect(Math.random()*512, Math.random()*512, 100, 5);
                }
            } else if (w.type === 'toxic') {
                ctx.fillStyle = bgStr;
                ctx.fillRect(0,0,512,512);
                for(let x=0; x<512; x+=32) {
                    for(let y=0; y<512; y+=32) {
                        ctx.fillStyle = Math.random() > 0.5 ? c1Str : c2Str;
                        ctx.fillRect(x,y,32,32);
                    }
                }
            } else if (w.type === 'ice') {
                const grad = ctx.createLinearGradient(0, 0, 512, 512);
                grad.addColorStop(0, c1Str);
                grad.addColorStop(1, bgStr);
                ctx.fillStyle = grad;
                ctx.fillRect(0,0,512,512);
                for(let i=0; i<200; i++) {
                    ctx.fillStyle = 'rgba(255,255,255,0.8)';
                    ctx.beginPath();
                    ctx.moveTo(Math.random()*512, Math.random()*512);
                    ctx.lineTo(Math.random()*512, Math.random()*512);
                    ctx.lineTo(Math.random()*512, Math.random()*512);
                    ctx.fill();
                }
            } else if (w.type === 'aura') {
                for(let i=0; i<512; i+=4) {
                    const r = Math.random();
                    ctx.fillStyle = r > 0.66 ? c1Str : (r > 0.33 ? c2Str : c3Str);
                    ctx.fillRect(0, i, 512, 4);
                }
            } else if (w.type === 'terra') {
                ctx.fillStyle = bgStr;
                ctx.fillRect(0,0,512,512);
                for(let i=0; i<50; i++) {
                    ctx.fillStyle = Math.random() > 0.5 ? c1Str : c3Str;
                    ctx.beginPath();
                    ctx.arc(Math.random()*512, Math.random()*512, 30+Math.random()*50, 0, Math.PI*2);
                    ctx.fill();
                }
            }
            return new THREE.CanvasTexture(canvas);
        }

        function getPlanetBase64(w) {
            // Re-render the canvas quickly to get base64
            const canvas = document.createElement('canvas');
            canvas.width = 128; // Smaller resolution for map nodes
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            const bgStr = getHexColor(w.bg);
            const c1Str = getHexColor(w.c1);
            const c2Str = getHexColor(w.c2);
            const c3Str = getHexColor(w.c3);
            
            if (w.type === 'neon') {
                ctx.fillStyle = bgStr; ctx.fillRect(0,0,128,128);
                for(let i=0; i<50; i++) {
                    ctx.fillStyle = Math.random() > 0.5 ? c1Str : c2Str;
                    ctx.beginPath(); ctx.arc(Math.random()*128, Math.random()*128, Math.random()*5, 0, Math.PI*2); ctx.fill();
                }
            } else if (w.type === 'fire') {
                const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 75);
                grad.addColorStop(0, c2Str); grad.addColorStop(1, bgStr);
                ctx.fillStyle = grad; ctx.fillRect(0,0,128,128);
                for(let i=0; i<30; i++) {
                    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(Math.random()*128, Math.random()*128, 25, 2);
                }
            } else if (w.type === 'toxic') {
                ctx.fillStyle = bgStr; ctx.fillRect(0,0,128,128);
                for(let x=0; x<128; x+=16) {
                    for(let y=0; y<128; y+=16) {
                        ctx.fillStyle = Math.random() > 0.5 ? c1Str : c2Str; ctx.fillRect(x,y,16,16);
                    }
                }
            } else if (w.type === 'ice') {
                const grad = ctx.createLinearGradient(0, 0, 128, 128);
                grad.addColorStop(0, c1Str); grad.addColorStop(1, bgStr);
                ctx.fillStyle = grad; ctx.fillRect(0,0,128,128);
                for(let i=0; i<50; i++) {
                    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath();
                    ctx.moveTo(Math.random()*128, Math.random()*128); ctx.lineTo(Math.random()*128, Math.random()*128); ctx.lineTo(Math.random()*128, Math.random()*128); ctx.fill();
                }
            } else if (w.type === 'aura') {
                for(let i=0; i<128; i+=2) {
                    const r = Math.random(); ctx.fillStyle = r > 0.66 ? c1Str : (r > 0.33 ? c2Str : c3Str); ctx.fillRect(0, i, 128, 2);
                }
            } else if (w.type === 'terra') {
                ctx.fillStyle = bgStr; ctx.fillRect(0,0,128,128);
                for(let i=0; i<15; i++) {
                    ctx.fillStyle = Math.random() > 0.5 ? c1Str : c3Str; ctx.beginPath();
                    ctx.arc(Math.random()*128, Math.random()*128, 10+Math.random()*15, 0, Math.PI*2); ctx.fill();
                }
            }
            return canvas.toDataURL();
        }

        function generateParticles() {
            for (let i = 0; i < particles; i++) {
                // Posiciones
                positions[i * 3] = (Math.random() - 0.5) * 4000;
                positions[i * 3 + 1] = (Math.random() - 0.5) * 4000;
                positions[i * 3 + 2] = (Math.random() - 0.5) * 4000;

                // Colores
                let mixedColor;
                const rand = Math.random();
                if (rand < 0.33) mixedColor = color1.clone().lerp(color2, Math.random());
                else if (rand < 0.66) mixedColor = color2.clone().lerp(color3, Math.random());
                else mixedColor = color3.clone().lerp(color1, Math.random());

                colors[i * 3] = mixedColor.r;
                colors[i * 3 + 1] = mixedColor.g;
                colors[i * 3 + 2] = mixedColor.b;
            }
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }
        generateParticles();

        const material = new THREE.PointsMaterial({
            size: 3,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            transparent: true,
            opacity: 0.8
        });

        const particleSystem = new THREE.Points(geometry, material);
        scene.add(particleSystem);

        function getPlanetGeometry(idx, size) {
            // Todos esféricos pero con variaciones de tamaño sutiles
            const sizeVariation = size * (0.8 + ((idx * 17) % 50) / 100.0); 
            return new THREE.SphereGeometry(sizeVariation, 32, 32);
        }

        // Núcleo (Planeta Actual)
        const coreMat = new THREE.MeshBasicMaterial({ 
            color: 0xffffff, 
            transparent: true, 
            opacity: 0.8,
            map: createPlanetTexture(worldPalettes[currentWorld])
        });
        const core = new THREE.Mesh(getPlanetGeometry(currentWorld, 400), coreMat);
        scene.add(core);

        // Portales alternativos (hasta 4 vecinos)
        const alternativePortals = [];
        for (let i = 0; i < 4; i++) {
            const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
            const mesh = new THREE.Mesh(getPlanetGeometry(0, 150), mat);
            mesh.visible = false;
            scene.add(mesh);
            alternativePortals.push({ mesh: mesh, mat: mat, targetIdx: -1 });
        }

        // Anomalía (Easter Egg)
        let anomalyActive = false;
        let omegaDiscovered = false;
        const anomalyGeo = new THREE.CapsuleGeometry(15, 30, 16, 16); 
        const anomalyMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0 });
        const anomalyMesh = new THREE.Mesh(anomalyGeo, anomalyMat);
        
        const anomalyLight = new THREE.PointLight(0x00ffff, 0, 500);
        anomalyMesh.add(anomalyLight);
        
        anomalyMesh.visible = false;
        scene.add(anomalyMesh);
        
        function spawnAnomaly() {
            anomalyActive = true;
            anomalyMesh.visible = true;
            anomalyMesh.position.set(
                (Math.random() - 0.5) * 800,
                (Math.random() - 0.5) * 600,
                cameraBaseZ - (400 + Math.random() * 400)
            );
            anomalyMesh.userData.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 2, 
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2
            );
            anomalyMesh.userData.maxLifespan = 180 + Math.random() * 180; // 3 a 6 segundos a 60fps
            anomalyMesh.userData.lifespan = anomalyMesh.userData.maxLifespan;
        }

        function updatePortalAppearance(portalObj, idx) {
            const targetWorld = worldPalettes[idx];
            portalObj.mat.map = createPlanetTexture(targetWorld);
            portalObj.mat.needsUpdate = true;
            
            portalObj.mesh.geometry.dispose();
            portalObj.mesh.geometry = getPlanetGeometry(idx, 150);
            portalObj.targetIdx = idx;
        }

        function getPlanetCoords(w) {
            return {
                x: w.bg % 999,
                y: w.c1 % 999,
                z: w.c2 % 999
            };
        }

        // Raycaster para interacciones
        const raycaster = new THREE.Raycaster();
        const mouseVector = new THREE.Vector2();

        document.addEventListener('click', (event) => {
            if (isModalOpen) return;
            initAudio();
            
            const visibleMeshes = alternativePortals.filter(p => p.mesh.visible).map(p => p.mesh);
            if (anomalyActive && anomalyMesh.visible) visibleMeshes.push(anomalyMesh);
            
            if (visibleMeshes.length === 0) return;
            
            mouseVector.x = normMouseX;
            mouseVector.y = normMouseY;
            
            raycaster.setFromCamera(mouseVector, camera);
            const intersects = raycaster.intersectObjects(visibleMeshes);
            
            if (intersects.length > 0) {
                const clickedMesh = intersects[0].object;
                
                if (clickedMesh === anomalyMesh) {
                    anomalyActive = false;
                    anomalyMesh.visible = false;
                    document.querySelectorAll('.planet-term').forEach(el => el.style.display = 'none');
                    planetInfo.style.opacity = '0';
                    isWarpSpeed = true;
                    warpTimer = 3.0; // Salto turbulento
                    warpTargetX = anomalyMesh.position.x;
                    warpTargetY = -anomalyMesh.position.y;
                    warpTargetZ = anomalyMesh.position.z + 100;
                    pendingWorldIndex = SECRET_INDEX;
                    playWarpSound(3.0);
                    return;
                }
                
                const pObj = alternativePortals.find(p => p.mesh === clickedMesh);
                if (pObj) {
                    document.querySelectorAll('.planet-term').forEach(el => el.style.display = 'none');
                    alternativePortals.forEach(p => { if (p !== pObj) p.mesh.visible = false; });
                    planetInfo.style.opacity = '0';
                    
                    isWarpSpeed = true;
                    warpTimer = 2.0; 
                    warpTargetX = pObj.mesh.position.x;
                    warpTargetY = -pObj.mesh.position.y; 
                    warpTargetZ = pObj.mesh.position.z + 200; 
                    pendingWorldIndex = pObj.targetIdx;
                    playWarpSound(2.0);
                }
            }
        });

        let absurdWarpInterval;
        function randomAbsurdWarp() {
            initAudio();
            if (isWarpSpeed || isModalOpen) return;
            
            isWarpSpeed = true;
            warpTimer = 4.0; // Warp súper largo
            warpTargetX = 0; warpTargetY = 0; warpTargetZ = 1200;
            playWarpSound(3.0);
            
            let changes = 0;
            const maxChanges = 15;
            absurdWarpInterval = setInterval(() => {
                let randIdx = Math.floor(Math.random() * worldPalettes.length);
                changeWorld(randIdx, true); // Cambiar sin reiniciar warp
                changes++;
                if (changes >= maxChanges) {
                    clearInterval(absurdWarpInterval);
                }
            }, 200);
        }

        function changeWorld(idx, skipWarp = false) {
            currentWorld = idx;
            alternativePortals.forEach(p => p.mesh.visible = false);
            document.querySelectorAll('.planet-term').forEach(el => el.style.display = 'none');
            
            if (!skipWarp) {
                // Disparar un salto hiperespacial de retorno para camuflar la transición
                isWarpSpeed = true;
                warpTimer = 2.0;
                warpTargetX = 0;
                warpTargetY = 0;
                warpTargetZ = 1200; // Volvemos al centro
                pendingWorldIndex = -1;
                playWarpSound(2.0);
            }

            const w = worldPalettes[currentWorld];
            updateAudioForWorld(w);
            
            const darkBg = getDarkenedHex(w.bg, 0.15);
            scene.fog.color.setHex(darkBg);
            document.body.style.backgroundColor = '#' + darkBg.toString(16).padStart(6, '0');
            document.getElementById('world-title').innerText = w.name;
            document.getElementById('world-desc').innerText = w.description || "LABORATORIO VISUAL";
            renderLinks(w);
            
            // Actualizar textura dinámica buscando en los archivos de la API primero
            const normName = w.name.toLowerCase().replace(/ /g, '');
            const folderName = normName;
            const pAssets = planetAssetsMap[folderName];
            
            let texFile = null;
            if (pAssets && pAssets.files) {
                texFile = pAssets.files.find(f => f.toLowerCase().startsWith('textura.'));
            }
            
            if (texFile) {
                const loader = new THREE.TextureLoader();
                const tex = loader.load(`${pAssets.folder}/${texFile}`);
                // tex.wrapS = THREE.RepeatWrapping; // Removed to support non-power-of-two images
                // tex.wrapT = THREE.RepeatWrapping;
                tex.colorSpace = THREE.SRGBColorSpace || THREE.LinearSRGBColorSpace; // In newer three.js
                coreMat.map = tex;
            } else {
                coreMat.map = createPlanetTexture(w);
            }
            coreMat.needsUpdate = true;
            
            core.geometry.dispose();
            core.geometry = getPlanetGeometry(currentWorld, 400);
            
            // Asegurarnos de que el núcleo y la UI sean visibles al llegar
            core.visible = true;
            const uiDiv = document.getElementById('ui');
            uiDiv.style.display = 'block';
            uiDiv.style.visibility = 'visible';
            // opacity se animará por CSS o en el render loop
            
            color1.setHex(w.c1);
            color2.setHex(w.c2);
            color3.setHex(w.c3);
            generateParticles();
        }

        // Bucle de animación (60fps)
        const clock = new THREE.Clock();
        let accumulatedTime = 0;

        function animate() {
            requestAnimationFrame(animate);
            render();
        }

        function render() {
            const delta = clock.getDelta();
            const timeRaw = clock.getElapsedTime();
            
            // Lógica de Velocidad Láser y desplazamiento
            if (isWarpSpeed) {
                
                warpTimer -= delta;
                targetSpeed = 15.0; 
                fovTarget = 140; 
                
                // Mover base de la cámara hacia el objetivo aleatorio
                cameraBaseX += (warpTargetX - cameraBaseX) * 0.03;
                cameraBaseY += (warpTargetY - cameraBaseY) * 0.03;
                cameraBaseZ += (warpTargetZ - cameraBaseZ) * 0.03;

                if (warpTimer <= 0) {
                    isWarpSpeed = false;
                    
                    if (pendingWorldIndex !== -1) {
                        const target = pendingWorldIndex;
                        pendingWorldIndex = -1;
                        cameraBaseX = 0; 
                        cameraBaseY = 0; 
                        cameraBaseZ = 1200;
                        changeWorld(target, true);
                        if (Math.random() < 1.0 && !anomalyActive && target !== SECRET_INDEX) {
                            spawnAnomaly();
                        }
                    }
                    
                    // Al llegar al punto panorámico, revelamos los portales vecinos
                    if (activeNeighbors.length > 0 && anchorPlanet) {
                        const currCoords = getPlanetCoords(worldPalettes[currentWorld]);
                        for (let i = 0; i < alternativePortals.length; i++) {
                            const pObj = alternativePortals[i];
                            if (i < activeNeighbors.length) {
                                const n = activeNeighbors[i];
                                updatePortalAppearance(pObj, n.idx);
                                
                                // Centramos la vista en el 'anchorPlanet' (el objetivo en esa dirección)
                                const dx = n.coords.x - anchorPlanet.coords.x;
                                const dy = n.coords.y - anchorPlanet.coords.y;
                                
                                // Reducimos el spread XY porque estarán mucho más cerca de la cámara para saltar el velo (niebla)
                                const px = cameraBaseX + (dx * 2.5);
                                const py = cameraBaseY + (dy * 2.5);
                                
                                // Los ponemos cerca de la cámara (z=-800 relativa a la cámara) para que no les afecte la niebla oscura
                                const pz = cameraBaseZ - 800 - (n.dist * 0.1); 
                                
                                pObj.mesh.position.set(px, py, pz);
                                
                                // Escalado basado en la distancia para falsear perspectiva sin alejarlos realmente
                                const scaleMult = Math.max(0.15, 0.8 - (n.dist / 1500));
                                pObj.mesh.scale.setScalar(scaleMult);
                                pObj.mesh.userData.baseScale = scaleMult;
                                pObj.mesh.visible = true;
                                

                            } else {
                                pObj.mesh.visible = false;

                            }
                        }
                        activeNeighbors = []; 
                        anchorPlanet = null; // Consumidos
                    } else if (!alternativePortals[0].mesh.visible) {
                        document.getElementById('ui').style.opacity = '1';
                    }
                }
            } else {
                targetSpeed = 1.0;
                fovTarget = 75;
                // La cámara vuelve lentamente a la órbita base (1200) si no hay portal a la vista
                const anyVisible = alternativePortals.some(p => p.mesh.visible);
                if (!anyVisible) {
                    cameraBaseX += (0 - cameraBaseX) * 0.005;
                    cameraBaseY += (0 - cameraBaseY) * 0.005;
                    cameraBaseZ += (1200 - cameraBaseZ) * 0.005;
                }
            }
            
            // Inercia de frenada / aceleración
            currentSpeed += (targetSpeed - currentSpeed) * 0.03;
            camera.fov += (fovTarget - camera.fov) * 0.03;
            camera.updateProjectionMatrix();

            accumulatedTime += delta * currentSpeed * 0.1;
            const time = accumulatedTime;

            // Rotación general
            particleSystem.rotation.y = time;
            particleSystem.rotation.z = time * 0.5;
            core.rotation.x = time * 2;
            core.rotation.y = time * 3;

            if (anomalyActive) {
                anomalyMesh.position.add(anomalyMesh.userData.velocity);
                anomalyMesh.rotation.x += 0.01;
                anomalyMesh.rotation.y += 0.02;
                
                const maxLife = anomalyMesh.userData.maxLifespan;
                const curLife = anomalyMesh.userData.lifespan;
                let fade = 1.0;
                if (curLife > maxLife - 60) fade = (maxLife - curLife) / 60.0;
                else if (curLife < 60) fade = curLife / 60.0;
                
                anomalyMesh.material.opacity = fade * 0.9;
                if (anomalyMesh.children.length > 0) anomalyMesh.children[0].intensity = fade * 500;

                anomalyMesh.userData.lifespan--;
                if (anomalyMesh.userData.lifespan <= 0) {
                    anomalyActive = false;
                    anomalyMesh.visible = false;
                }
            }

            // Físicas de cámara y Parallax
            targetX = mouseX * 1.5;
            targetY = mouseY * 1.5;
            
            camera.position.x = cameraBaseX + targetX;
            camera.position.y = cameraBaseY - targetY;
            camera.position.z = cameraBaseZ; 
            
            // Siempre miramos al centro del universo
            camera.lookAt(scene.position);

            // Raycasting en tiempo real para portales alternativos (hover y cursor)
            let hoveredIdx = -1;
            const isMapVisible = document.getElementById('game-map').style.display === 'flex';
            const visibleMeshes = alternativePortals.filter(p => p.mesh.visible).map(p => p.mesh);
            if (anomalyActive && anomalyMesh.visible) visibleMeshes.push(anomalyMesh);
            
            if (!isMapVisible && visibleMeshes.length > 0) {
                mouseVector.x = normMouseX;
                mouseVector.y = normMouseY;
                raycaster.setFromCamera(mouseVector, camera);
                const intersects = raycaster.intersectObjects(visibleMeshes);
                if (intersects.length > 0) {
                    document.body.style.cursor = 'pointer';
                    const clickedMesh = intersects[0].object;
                    
                    if (clickedMesh === anomalyMesh) {
                        // Hover sobre anomalía = salto instantáneo
                        anomalyActive = false;
                        anomalyMesh.visible = false;
                        omegaDiscovered = true;
                        document.querySelectorAll('.planet-term').forEach(el => el.style.display = 'none');
                        planetInfo.style.opacity = '0';
                        isWarpSpeed = true;
                        warpTimer = 3.0;
                        warpTargetX = anomalyMesh.position.x;
                        warpTargetY = -anomalyMesh.position.y;
                        warpTargetZ = anomalyMesh.position.z + 100;
                        pendingWorldIndex = SECRET_INDEX;
                        playWarpSound(3.0);
                        return;
                    }
                    
                    hoveredIdx = alternativePortals.findIndex(p => p.mesh === clickedMesh);
                    const pObj = alternativePortals[hoveredIdx];
                    if (pObj && pObj.targetIdx !== -1) {
                        const targetWorld = worldPalettes[pObj.targetIdx];
                        const c = getPlanetCoords(targetWorld);
                        planetInfo.style.opacity = '1';
                        infoTitle.innerText = targetWorld.name;
                        const desc = targetWorld.description || targetWorld.type;
                        infoDesc.innerHTML = `${desc}<br/><span style="color:#0ff; font-size:0.7rem;">Coordenadas: [X: ${c.x}] [Y: ${c.y}] [Z: ${c.z}]</span>`;
                    }
                } else {
                    document.body.style.cursor = 'default';
                    planetInfo.style.opacity = '0';
                }
            } else {
                document.body.style.cursor = 'default';
                planetInfo.style.opacity = '0';
            }

            // Animación y HUD de portales
            alternativePortals.forEach((pObj, i) => {
                if (pObj.mesh.visible) {
                    pObj.mesh.rotation.y += 0.05;
                    const base = pObj.mesh.userData.baseScale || 1.0;
                    pObj.mesh.scale.setScalar(base + Math.sin(timeRaw * 5) * 0.1 * base);
                }
            });


            


            // Deformar partículas sutilmente
            const posArray = particleSystem.geometry.attributes.position.array;
            for(let i = 0; i < particles * 3; i += 3) {
                posArray[i] += Math.sin(time * 5 + posArray[i+1] * 0.005) * 0.3;
                posArray[i+1] += Math.cos(time * 5 + posArray[i] * 0.005) * 0.3;
            }
            particleSystem.geometry.attributes.position.needsUpdate = true;

            renderer.render(scene, camera);
        }

        // Eventos de usuario
        function onDocumentMouseMove(event) {
            if (isModalOpen) return;
            if (document.getElementById('game-map').style.display === 'flex') return;
            
            mouseX = event.clientX - windowHalfX;
            mouseY = event.clientY - windowHalfY;
            
            normMouseX = (event.clientX / window.innerWidth) * 2 - 1;
            normMouseY = -(event.clientY / window.innerHeight) * 2 + 1;
            
            let tx = event.clientX;
            let ty = event.clientY + 20; // Justo debajo
            
            // Límites para que no se salga
            const w = planetInfo.offsetWidth || 250;
            const h = planetInfo.offsetHeight || 80;
            
            if (tx + w > window.innerWidth) tx = window.innerWidth - w - 10;
            if (ty + h > window.innerHeight) ty = event.clientY - h - 10; // Si choca abajo, lo pone arriba del ratón
            
            planetInfo.style.left = tx + 'px';
            planetInfo.style.top = ty + 'px';
        }
        let lastTapTime = 0;
        function onDocumentTouchStart(event) {
            if (isModalOpen) return;
            initAudio();
            if (event.touches.length === 1) {
                const now = new Date().getTime();
                const timeDiff = now - lastTapTime;
                
                mouseX = event.touches[0].pageX - windowHalfX;
                mouseY = event.touches[0].pageY - windowHalfY;
                normMouseX = (event.touches[0].pageX / window.innerWidth) * 2 - 1;
                normMouseY = -(event.touches[0].pageY / window.innerHeight) * 2 + 1;
                
                if (timeDiff < 300 && timeDiff > 0) {
                    // Doble toque en móviles detectado
                    triggerJump();
                } else {
                    // Toque simple, intentamos hacer clic en el portal
                    mouseVector.x = normMouseX;
                    mouseVector.y = normMouseY;
                    raycaster.setFromCamera(mouseVector, camera);
                    const visibleMeshes = alternativePortals.filter(p => p.mesh.visible).map(p => p.mesh);
                    if (visibleMeshes.length > 0) {
                        const intersects = raycaster.intersectObjects(visibleMeshes);
                        if (intersects.length > 0) {
                            const clickedMesh = intersects[0].object;
                            const pObj = alternativePortals.find(p => p.mesh === clickedMesh);
                            if (pObj) {
                                changeWorld(pObj.targetIdx);
                            }
                        }
                    }
                }
                lastTapTime = now;
            }
        }
        function onDocumentTouchMove(event) {
            if (isModalOpen) return;
            if (event.touches.length === 1) {
                mouseX = event.touches[0].pageX - windowHalfX;
                mouseY = event.touches[0].pageY - windowHalfY;
                normMouseX = (event.touches[0].pageX / window.innerWidth) * 2 - 1;
                normMouseY = -(event.touches[0].pageY / window.innerHeight) * 2 + 1;
            }
        }
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Map Logic
        let mapPanX = 0;
        let mapPanY = 0;
        let isDraggingMap = false;
        let mapDragStartX = 0;
        let mapDragStartY = 0;

        let mapBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
        function renderMap() {
            const content = document.getElementById('map-content');
            content.innerHTML = '';
            
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            
            worldPalettes.forEach((w, i) => {
                if (w.secret && !omegaDiscovered) return;
                
                const node = document.createElement('div');
                node.className = 'map-node';
                
                const r = 80 + i * 40; 
                
                // Calcular ángulo cumulativo mezclando estructura y caos orgánico
                let theta = 0;
                for (let j = 0; j < i; j++) {
                    // Cada ciclo de 3 planetas cambiamos de fase para que se note el desorden rápido
                    if (Math.floor(j / 3) % 2 === 0) {
                        theta += 2.094395; // ~120 grados (La Y perfecta estructurada)
                    } else {
                        theta += 2.399963; // ~137.5 grados (Ángulo áureo de Fibonacci, orgánico)
                    }
                }
                
                const x = r * Math.cos(theta);
                const y = r * Math.sin(theta);
                
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                
                const normName = w.name.toLowerCase().replace(/ /g, '');
                const folderName = normName;
                const pAssets = planetAssetsMap[folderName];
                let bgUrl = null;
                
                if (pAssets && pAssets.files) {
                    const imgFiles = pAssets.files.filter(f => {
                        const ext = f.toLowerCase();
                        return ext.endsWith('.png') || ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.webp');
                    });
                    if (imgFiles.length > 0) {
                        bgUrl = `${pAssets.folder}/${imgFiles[0]}`;
                    }
                }
                
                node.style.left = x + 'px';
                node.style.top = y + 'px';
                node.style.backgroundImage = bgUrl ? `url(${bgUrl})` : `url(${getPlanetBase64(w)})`;
                node.style.backgroundSize = 'cover';
                node.style.borderColor = '#' + w.c1.toString(16).padStart(6, '0');
                node.style.color = '#' + w.c1.toString(16).padStart(6, '0'); 
                node.innerHTML = `<span>${w.name}</span>`;
                
                node.onclick = () => {
                    closeMap(true); // indicamos que estamos saltando
                    // Volar hacia adelante genéricamente desde el mapa
                    isWarpSpeed = true;
                    warpTimer = 2.0;
                    warpTargetX = (Math.random() - 0.5) * 1000;
                    warpTargetY = (Math.random() - 0.5) * 1000;
                    warpTargetZ = -2000; // Volar profundo hacia las estrellas
                    pendingWorldIndex = i;
                    playWarpSound(2.0);
                };
                
                node.dataset.x = x;
                node.dataset.y = y;
                node.id = 'map-node-' + i;
                
                content.appendChild(node);
            });
            
            mapBounds = { minX, maxX, minY, maxY };
        }

        function triggerTVNoise(typeClass) {
            const noise = document.getElementById('tv-noise');
            if (noise) {
                noise.classList.remove('tv-noise-in', 'tv-noise-out');
                void noise.offsetWidth; // Reflow
                noise.classList.add(typeClass);
            }
        }

        function openMap() {
            triggerTVNoise('tv-noise-in');
            const gameMap = document.getElementById('game-map');
            gameMap.style.display = 'flex';
            
            gameMap.classList.remove('map-opening');
            void gameMap.offsetWidth; // Forzar reflow para reiniciar la animación
            gameMap.classList.add('map-opening');
            
            // Ocultar nombre y descripción del planeta actual
            const uiDiv = document.getElementById('ui');
            uiDiv.style.display = 'none';
            uiDiv.style.opacity = '0';
            uiDiv.style.visibility = 'hidden';
            
            
            renderMap();
            centerMapOn(currentWorld);
            document.getElementById('map-search').value = '';
            document.getElementById('map-search-results').style.display = 'none';
        }

        function closeMap(jumping = false) {
            triggerTVNoise('tv-noise-out');
            document.getElementById('game-map').style.display = 'none';
            const inCrossroads = alternativePortals.some(p => p.mesh.visible);
            if (!jumping && !isWarpSpeed && !inCrossroads) {
                // Restaurar textos al cerrar el mapa sin viajar y sin estar en la encrucijada
                const uiDiv = document.getElementById('ui');
                uiDiv.style.display = 'block';
                uiDiv.style.opacity = '1';
                uiDiv.style.visibility = 'visible';
            }
        }

        function centerMapOn(index) {
            const node = document.getElementById('map-node-' + index);
            if (node) {
                const x = -parseFloat(node.dataset.x);
                const y = -parseFloat(node.dataset.y);
                mapPanX = x;
                mapPanY = y;
                updateMapTransform();
                
                document.querySelectorAll('.map-node').forEach(n => n.style.transform = 'translate(-50%, -50%) scale(1)');
                node.style.transform = 'translate(-50%, -50%) scale(1.5)';
            }
        }

        function updateMapTransform() {
            const margin = 100;
            const screenW = window.innerWidth;
            const screenH = window.innerHeight;
            
            let maxPanX = margin - mapBounds.minX - screenW/2;
            let minPanX = screenW - margin - mapBounds.maxX - screenW/2;
            
            if (minPanX > maxPanX) {
                const temp = minPanX;
                minPanX = maxPanX;
                maxPanX = temp;
            }
            
            let maxPanY = margin - mapBounds.minY - screenH/2;
            let minPanY = screenH - margin - mapBounds.maxY - screenH/2;
            
            if (minPanY > maxPanY) {
                const temp = minPanY;
                minPanY = maxPanY;
                maxPanY = temp;
            }
            
            if (mapPanX > maxPanX) mapPanX = maxPanX;
            if (mapPanX < minPanX) mapPanX = minPanX;
            if (mapPanY > maxPanY) mapPanY = maxPanY;
            if (mapPanY < minPanY) mapPanY = minPanY;

            const content = document.getElementById('map-content');
            content.style.transform = `translate(${mapPanX}px, ${mapPanY}px)`;
        }

        const mapContainer = document.getElementById('map-container');
        mapContainer.addEventListener('mousedown', (e) => {
            isDraggingMap = true;
            mapDragStartX = e.clientX - mapPanX;
            mapDragStartY = e.clientY - mapPanY;
            document.getElementById('map-content').style.transition = 'none';
        });
        window.addEventListener('mousemove', (e) => {
            if (!isDraggingMap) return;
            mapPanX = e.clientX - mapDragStartX;
            mapPanY = e.clientY - mapDragStartY;
            updateMapTransform();
        });
        window.addEventListener('mouseup', () => {
            if (isDraggingMap) {
                isDraggingMap = false;
                document.getElementById('map-content').style.transition = 'transform 0.8s cubic-bezier(0.165, 0.84, 0.44, 1)';
            }
        });
        
        const searchInput = document.getElementById('map-search');
        const resultsBox = document.getElementById('map-search-results');
        
        searchInput.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            if (q === '') {
                resultsBox.style.display = 'none';
                return;
            }
            
            const results = worldPalettes.map((w, i) => ({w, i})).filter(item => item.w.name.toLowerCase().includes(q));
            
            resultsBox.innerHTML = '';
            if (results.length > 0) {
                results.forEach(res => {
                    const div = document.createElement('div');
                    div.className = 'search-result';
                    div.innerText = res.w.name;
                    div.onclick = () => {
                        centerMapOn(res.i);
                        searchInput.value = res.w.name;
                        resultsBox.style.display = 'none';
                    };
                    resultsBox.appendChild(div);
                });
                resultsBox.style.display = 'flex';
            } else {
                resultsBox.style.display = 'none';
            }
        });

        animate();
