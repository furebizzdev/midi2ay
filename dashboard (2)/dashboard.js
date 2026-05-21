// Dashboard usando WebMscore + positions-based conversion
console.log("Dashboard carregado");

let loadedMidi = null;
let convertedData = null;
let webMscoreReady = false;

async function initWebMscore() {
    if (!WebMscore) return false;
    try {
        WebMscore.ready.then(() => { webMscoreReady = true; });
        return true;
    } catch(e) { console.warn("WebMscore não disponível"); return false; }
}

function init() {
    initWebMscore();
    
    const dz = document.getElementById("midi-dropzone");
    const fi = document.getElementById("midi-input");
    const cb = document.getElementById("btn-convert");
    const db = document.getElementById("btn-download");
    const pm = document.getElementById("btn-play-midi");
    const pa = document.getElementById("btn-play-ay");
    const st = document.getElementById("btn-stop");
    const cc = document.getElementById("btn-copy-code");
    
    dz.addEventListener("click", () => fi.click());
    fi.addEventListener("change", e => e.target.files[0] && handleFile(e.target.files[0]));
    
    cb.addEventListener("click", async () => {
        if (!loadedMidi) return;
        try {
            // Try new positions-based conversion first
            if (webMscoreReady && WebMscore) {
                try {
                    console.log("Usando WebMscore + positions...");
                    const score = await WebMscore.load("midi", loadedMidi.bytes, [], false);
                    const { positionsToMaestroAy } = await import('./positions/positionsToMaestroAy.js');
                    
                    // Extract positions from WebMscore
                    const xml = await score.saveXml();
                    const positions = extractPositionsFromXml(xml);
                    
                    const result = positionsToMaestroAy(positions, { 
                        title: "Music", 
                        maxSimultaneousNotes: 4,
                        timeStepsPerQuarter: 4 
                    });
                    convertedData = result.maestroDocument;
                } catch(err) { 
                    console.warn("WebMscore falhou:", err); 
                }
            }
            
            // Fallback to MIDI direct conversion
            if (!convertedData) {
                const { positionsToMaestroAy } = await import('./positions/positionsToMaestroAy.js');
                const { parseMidiToNoteEvents } = await import('./midi/parseMidi.js');
                const parsed = parseMidiToNoteEvents(loadedMidi.bytes);
                
                // Convert MIDI notes to positions
                const ticksPerQuarter = parsed.ticksPerQuarter || 480;
                const positions = parsed.notes.map(n => ({
                    time: n.startTicks / ticksPerQuarter,
                    duration: n.durationTicks / ticksPerQuarter,
                    pitch: n.midi,
                    staff: 1,
                    velocity: 100,
                    channel: 0,
                    program: undefined
                }));
                
                const result = positionsToMaestroAy(positions, { 
                    title: "Music", 
                    bpm: parsed.bpm,
                    maxSimultaneousNotes: 4,
                    timeStepsPerQuarter: 4 
                });
                convertedData = result.maestroDocument;
            }
            
            const { serializeMaestroAy } = await import('./maestroAy/serializeMaestroAy.js');
            document.getElementById("ay-code-output").textContent = serializeMaestroAy(convertedData);
            window.convertedDoc = convertedData;
            db.style.display = "inline-block";
            pa.disabled = false;
        } catch(err) {
            alert("Erro: " + err.message);
        }
    });
    
    db.addEventListener("click", async () => {
        if (!convertedData) return;
        try {
            const { serializeMaestroAy } = await import('./maestroAy/serializeMaestroAy.js');
            const blob = new Blob([serializeMaestroAy(convertedData)], {type: "text/plain"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "music.ay";
            a.click();
            URL.revokeObjectURL(url);
        } catch(err) { alert("Erro: " + err.message); }
    });
    
    pm.addEventListener("click", () => window.playWithAISynth && loadedMidi && window.playWithAISynth(loadedMidi.notes));
    pa.addEventListener("click", () => window.playWithAISynth && convertedData && window.playWithAISynth(null, "ay"));
    st.addEventListener("click", () => window.stopPlayback && window.stopPlayback());
    cc.addEventListener("click", () => { navigator.clipboard.writeText(document.getElementById("ay-code-output").textContent); alert("Copiado!"); });
}

// Helper to extract note positions from MusicXML
function extractPositionsFromXml(xml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    const positions = [];
    
    // Get divisions (ticks per quarter)
    const divisions = parseInt(doc.querySelector("divisions")?.textContent || "480");
    const notes = doc.querySelectorAll("note");
    
    let currentTime = 0;
    
    notes.forEach(note => {
        const duration = parseInt(note.querySelector("duration")?.textContent || "0");
        const step = note.querySelector("step")?.textContent || "C";
        const octave = parseInt(note.querySelector("octave")?.textContent || "4");
        const alter = parseInt(note.querySelector("alter")?.textContent || "0");
        
        // Convert to MIDI
        const semitones = {C:0, D:2, E:4, F:5, G:7, A:9, B:11};
        const midi = 12 + octave * 12 + (semitones[step] || 0) + alter;
        
        if (!note.querySelector("rest")) {
            positions.push({
                time: currentTime / divisions,
                duration: duration / divisions,
                pitch: midi,
                staff: 1,
                velocity: 100,
                channel: 0
            });
        }
        
        currentTime += duration;
    });
    
    return positions;
}

async function handleFile(file) {
    try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { parseMidiToNoteEvents } = await import('./midi/parseMidi.js');
        loadedMidi = parseMidiToNoteEvents(bytes);
        loadedMidi.bytes = bytes;
        window.loadedMidi = loadedMidi;
        
        document.getElementById("meta").innerHTML = `<p>BPM: ${loadedMidi.bpm} | Notas: ${loadedMidi.notes.length}</p>`;
        document.getElementById("btn-convert").disabled = false;
        document.getElementById("btn-play-midi").disabled = false;
    } catch (e) { alert("Erro: " + e.message); }
}

document.addEventListener("DOMContentLoaded", init);