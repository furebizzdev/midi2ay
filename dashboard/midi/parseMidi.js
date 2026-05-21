function readUint16BE(data, offset) {
    return (data[offset] & 0xff) << 8 | (data[offset + 1] & 0xff);
}
function readUint32BE(data, offset) {
    return ((data[offset] & 0xff) << 24) | ((data[offset + 1] & 0xff) << 16) | ((data[offset + 2] & 0xff) << 8) | (data[offset + 3] & 0xff);
}
/**
 * MIDI variable length quantity (VLQ)
 */
function readVLQ(data, offset) {
    let value = 0;
    let i = offset;
    for (;;) {
        if (i >= data.length)
            throw new Error("MIDI VLQ fora do buffer.");
        const b = data[i] & 0xff;
        value = (value << 7) | (b & 0x7f);
        i++;
        if ((b & 0x80) === 0)
            break;
    }
    return { value, nextOffset: i };
}
function parseMidiHeader(data) {
    // "MThd"
    if (data.length < 14)
        throw new Error("Arquivo MIDI muito curto.");
    if (String.fromCharCode(data[0], data[1], data[2], data[3]) !== "MThd") {
        throw new Error("Cabeçalho MIDI (MThd) não encontrado.");
    }
    const formatType = readUint16BE(data, 8);
    const tracksCount = readUint16BE(data, 10);
    const ticksPerQuarter = readUint16BE(data, 12);
    return { formatType, tracksCount, ticksPerQuarter };
}
export function parseMidiToNoteEvents(midiBytes) {
    const data = midiBytes;
    const { tracksCount, ticksPerQuarter } = parseMidiHeader(data);
    // Lê trilhas (MTrk)
    let offset = 14; // após MThd chunk (assumindo chunk length 6)
    const notes = [];
    // Para converter NoteOn/Off em duração:
    // key: trackIndex + channel + noteNumber
    const activeNotes = new Map();
    const channelPrograms = new Map(); // channel -> program (1-indexed)
    let keySigSf  = 0;   // armadura: positivo=sustenidos, negativo=bemóis
    let timeSigNum = 4;
    let timeSigDen = 4;
    let firstTempoMicrosecondsPerQuarter;
    for (let trackIndex = 0; trackIndex < tracksCount; trackIndex++) {
        if (offset + 8 > data.length)
            throw new Error("Trilha MIDI fora do buffer.");
        const chunkId = String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
        if (chunkId !== "MTrk")
            throw new Error(`Chunk MTrk não encontrado na trilha ${trackIndex}.`);
        const chunkLength = readUint32BE(data, offset + 4);
        const trackEnd = offset + 8 + chunkLength;
        let timeTicks = 0;
        offset += 8;
        while (offset < trackEnd) {
            const { value: deltaTicks, nextOffset } = readVLQ(data, offset);
            timeTicks += deltaTicks;
            offset = nextOffset;
            const eventByte = data[offset] & 0xff;
            offset++;
            // Meta event
            if (eventByte === 0xff) {
                const metaType = data[offset] & 0xff;
                offset++;
                const { value: metaLen, nextOffset: o2 } = readVLQ(data, offset);
                offset = o2;
                if (offset + metaLen > trackEnd)
                    throw new Error("Meta event fora do buffer.");
                // tempo: 0x51, length 3
                if (metaType === 0x51 && metaLen === 3) {
                    const mpq = (data[offset] & 0xff) << 16 | (data[offset + 1] & 0xff) << 8 | (data[offset + 2] & 0xff);
                    if (firstTempoMicrosecondsPerQuarter === undefined)
                        firstTempoMicrosecondsPerQuarter = mpq;
                }
                offset += metaLen;
                continue;
            }
            // SysEx: 0xF0/0xF7
            if (eventByte === 0xf0 || eventByte === 0xf7) {
                const { value: len, nextOffset: o2 } = readVLQ(data, offset);
                offset = o2 + len;
                continue;
            }
            // MIDI channel events: high nibble = type, low nibble = channel
            const statusHigh = eventByte & 0xf0;
            const channel = eventByte & 0x0f;
            if (statusHigh === 0x90 || statusHigh === 0x80) {
                const noteNumber = data[offset] & 0xff;
                const velocity = data[offset + 1] & 0xff;
                offset += 2;
                const key = `${trackIndex}:${channel}:${noteNumber}`;
                if (statusHigh === 0x90 && velocity > 0) {
                    // NoteOn
                    activeNotes.set(key, { startTicks: timeTicks, midi: noteNumber });
                }
                else {
                    // NoteOff (ou NoteOn com velocity=0)
                    const active = activeNotes.get(key);
                    if (active) {
                        const durationTicks = Math.max(1, timeTicks - active.startTicks);
                        notes.push({
                            midi: active.midi,
                            startTicks: active.startTicks,
                            durationTicks,
                            trackIndex,
                            channel,
                            program: channelPrograms.get(channel),
                        });
                        activeNotes.delete(key);
                    }
                }
                continue;
            }
            // Outros eventos: ignorar tamanho (para simplificar)
            // Tipos mais comuns:
            // - 2 bytes para events 0xC0/0xD0
            // - 2 bytes para events 0xA0/0xB0/0xE0 (note/control)
            // Aqui vamos cobrir o necessário para não estourar:
            if (statusHigh === 0xc0) {
                const program = (data[offset] & 0xff) + 1;
                channelPrograms.set(channel, program);
                offset += 1;
            } else if (statusHigh === 0xd0) {
                offset += 1;
            }
            else if (statusHigh === 0xa0 || statusHigh === 0xb0 || statusHigh === 0xe0) {
                offset += 2;
            }
            else {
                // fallback conservador: tenta consumir 2 bytes
                offset += 2;
            }
        }
        offset = trackEnd;
    }
    let bpm;
    if (firstTempoMicrosecondsPerQuarter !== undefined) {
        bpm = 60_000_000 / firstTempoMicrosecondsPerQuarter;
    }
    return { bpm, ticksPerQuarter, notes };
}
