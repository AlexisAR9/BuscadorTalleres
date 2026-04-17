let map = null;
let markers = []; 
let talleresDB = [];

// 1. Inicializar Mapa Principal
function inicializarMapa() {
    map = L.map('map', { zoomControl: false }).setView([-34.4833, -58.7167], 13);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        attribution: '© OpenStreetMap' 
    }).addTo(map);
}

// 2. Cargar y Fusionar Datos (JSON + LocalStorage)
async function cargarTalleres() {
    try {
        const respuesta = await fetch('data.json');
        let talleresBase = await respuesta.json();

        const dataLocal = localStorage.getItem('cc_talleres');
        let talleresLocales = dataLocal && dataLocal !== "[]" ? JSON.parse(dataLocal) : [];

        // Usamos Map para evitar talleres duplicados por ID
        const mapaFusion = new Map();
        talleresBase.forEach(t => mapaFusion.set(t.name, t));
        talleresLocales.forEach(t => mapaFusion.set(t.name, t)); 

        talleresDB = Array.from(mapaFusion.values());
        
        dibujarMarcadores(talleresDB);
        mostrarResultadosLista(talleresDB); // Mostrar todos los talleres al cargar
    } catch (error) {
        console.error("Error al cargar los talleres:", error);
    }
}

// 3. Dibujar Pines en el Mapa
function dibujarMarcadores(talleres) {
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    talleres.forEach(taller => {
        if (taller.locationData && taller.locationData.lat && taller.locationData.lng) {
            const marker = L.marker([taller.locationData.lat, taller.locationData.lng]).addTo(map);
            marker.bindPopup(`<b>${taller.name}</b><br><button onclick="verDetallesPorId(${taller.id})">Ver Detalles</button>`);
            markers.push(marker);
        }
    });
}

// 4. Lógica de Búsqueda y Filtrado
const searchInput = document.getElementById('search-input');

// Búsqueda en tiempo real por nombre de taller
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    
    const resultados = talleresDB.filter(t => {
        const coincideNombre = t.name.toLowerCase().includes(term);
        // Validamos que exista la dirección antes de buscar en ella
        const coincideDir = t.locationData.address && t.locationData.address.toLowerCase().includes(term);
        
        return coincideNombre || coincideDir;
    });
    
    mostrarResultadosLista(resultados);
    dibujarMarcadores(resultados);
});

// Búsqueda profunda al apretar Enter
searchInput.addEventListener('keypress', (e) => { 
    if (e.key === 'Enter') ejecutarBusqueda(); 
});

// Consumo de la API USIG
async function ejecutarBusqueda() {
    const query = searchInput.value.trim();
    if (query.length < 3) return;

    try {
        const url = `https://servicios.usig.buenosaires.gob.ar/normalizar/?direccion=${encodeURIComponent(query)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.direccionesNormalizadas && data.direccionesNormalizadas.length > 0) {
            const dir = data.direccionesNormalizadas[0];
            
            if (dir.coordenadas && dir.coordenadas.y && dir.coordenadas.x) {
                const latBusqueda = parseFloat(dir.coordenadas.y);
                const lngBusqueda = parseFloat(dir.coordenadas.x);
                
                // Mover mapa a la dirección buscada
                map.flyTo([latBusqueda, lngBusqueda], 16);

                // Filtrar lista: Mostrar solo los talleres cercanos (aprox 200 metros)
                const resultados = talleresDB.filter(t => {
                    if (!t.locationData.lat || !t.locationData.lng) return false;
                    
                    const diferenciaLat = Math.abs(t.locationData.lat - latBusqueda);
                    const diferenciaLng = Math.abs(t.locationData.lng - lngBusqueda);
                    const radioCercania = 0.002; 

                    return diferenciaLat < radioCercania && diferenciaLng < radioCercania;
                });

                mostrarResultadosLista(resultados);
                dibujarMarcadores(resultados);
            }
        } else {
            alert("No se encontró la dirección exacta. Intenta ser más específico.");
        }
    } catch (error) { 
        console.error("Error API USIG:", error); 
    }
}

// 5. Renderizar Lista en el Flexbox lateral
function mostrarResultadosLista(resultados) {
    const container = document.getElementById('search-results');
    container.innerHTML = '';
    
    if (resultados.length === 0) {
        container.style.display = 'block';
        container.innerHTML = '<div style="padding: 15px; color: #5f6368; text-align: center;">No hay talleres en esta ubicación.</div>';
        return;
    }

    container.style.display = 'block';
    
    resultados.forEach(t => {
        const div = document.createElement('div');
        div.className = 'result-item';
        
        const iconos = { 'Gastronomía':'🍳', 'Carpintería':'🪚', 'Artesanías':'🏺', 'Fotografía':'📸', 'Música':'🎵' };
        let icono = iconos[t.category] || '📍';
        let subtitulo = t.type === 'propio' ? `Centro Cultural - Aula ${t.locationData.aula}` : (t.locationData.address || "Dirección no disponible");

        div.innerHTML = `
            <div class="icon-container">${icono}</div>
            <div class="text-container">
                <h4>${t.name}</h4>
                <p>${subtitulo}</p>
            </div>
            ${t.type === 'propio' ? '<span class="action-text">Centro</span>' : ''}
        `;
        
        div.onclick = () => {
            if(t.locationData.lat) {
                map.flyTo([t.locationData.lat, t.locationData.lng], 17);
                verDetalles(t);
            }
        };
        container.appendChild(div);
    });
}

// 6. Lógica del Modal de Detalles
function cerrarDetalles() {
    document.getElementById('detail-view').style.display = 'none';
}

function verDetallesPorId(id) {
    const taller = talleresDB.find(t => t.id === id);
    if (taller) verDetalles(taller);
}

function verDetalles(t) {
    document.getElementById('detail-view').style.display = 'flex';
    document.getElementById('detail-img').src = t.image;
    document.getElementById('detail-title').textContent = t.name;
    document.getElementById('detail-badge').textContent = t.type === 'propio' ? 'Centro Cultural' : 'Taller Particular';
    document.getElementById('detail-badge').className = 'badge badge-' + t.type;
    document.getElementById('detail-category-text').textContent = t.category;
    document.getElementById('detail-description').textContent = t.description;
    
    const ul = document.getElementById('detail-activities');
    ul.innerHTML = '';
    t.activities.forEach(act => ul.innerHTML += `<li>${act}</li>`);
    
    const dynInfo = document.getElementById('dynamic-detail-info');
    if (t.type === 'propio') {
        dynInfo.innerHTML = `
            <h3 class="section-title">Ubicación y Horarios</h3>
            <p>📍 <strong>Módulo:</strong> ${t.locationData.modulo}, <strong>Aula:</strong> ${t.locationData.aula}</p>
            <p>🕒 <strong>Horarios de atención:</strong> ${t.locationData.hours}</p>
        `;
    } else {
        dynInfo.innerHTML = `
            <h3 class="section-title">Ubicación y Horarios</h3>
            <p>📍 <strong>Dirección:</strong> ${t.locationData.address}</p>
            <p>🕒 <strong>Horarios de atención:</strong> ${t.locationData.hours}</p>
        `;
    }
    
    document.getElementById('detail-phone').textContent = t.phone;
    document.getElementById('detail-social').textContent = t.social;
}

// Arrancar la aplicación
inicializarMapa();
cargarTalleres();
