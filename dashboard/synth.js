// Sintetizador minimalista
let audioCtx = null;
let playbackInterval = null;

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

function playWithAISynth(notes, source = "midi") {
    if (!notes) {
        const globalMidi = window.loadedMidi;
        const globalConverted = window.convertedDoc;
        const decodeFn = window.decodeAyDocToNotes;
        
        if (globalMidi && globalMidi.notes) {
            notes = globalMidi.notes;
        } else if (globalConverted && decodeFn) {
            notes = decodeFn(globalConverted, 4);
        } else {
            alert("Carregue um MIDI primeiro!");
            return;
        }
    }
    
    if (!notes || notes.length === 0) {
        alert("Nenhuma nota!");
        return;
    }
    
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    
    const bpm = window.loadedMidi?.bpm || 120;
    const ticksPerQuarter = window.loadedMidi?.ticksPerQuarter || 480;
    const secPerQuarter = 60 / bpm;
    const ticksPerSec = ticksPerQuarter / secPerQuarter;
    
    stopPlayback();
    
    const totalTicks = Math.max(...notes.map(n => n.startTicks + n.durationTicks));
    const totalSec = totalTicks / ticksPerSec;
    
    notes.forEach(note => {
        const start = note.startTicks / ticksPerSec;
        const dur = note.durationTicks / ticksPerSec;
        const freq = 440 * Math.pow(2, (note.midi - 69) / 12);
        
        setTimeout(() => playNote(ctx, freq, dur), start * 1000);
    });
    
    const start = Date.now();
    playbackInterval = setInterval(() => {
        const elapsed = (Date.now() - start) / 1000;
        const progress = (elapsed / totalSec) * 100;
        const bar = document.getElementById("play-progress");
        if (bar) bar.value = progress;
        if (elapsed >= totalSec) stopPlayback();
    }, 50);
}

function playNote(ctx, freq, duration) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration + 0.05);
}

function stopPlayback() {
    if (playbackInterval) {
        clearInterval(playbackInterval);
        playbackInterval = null;
    }
}