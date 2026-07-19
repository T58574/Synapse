export namespace backend {
	
	export class AudioDevice {
	    name: string;
	    id: string;
	    isDefault: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AudioDevice(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.id = source["id"];
	        this.isDefault = source["isDefault"];
	    }
	}
	export class Playlist {
	    name: string;
	    trackPaths: string[];
	
	    static createFrom(source: any = {}) {
	        return new Playlist(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.trackPaths = source["trackPaths"];
	    }
	}
	export class TrackMetadata {
	    filePath: string;
	    title: string;
	    durationSec: number;
	    bpm: number;
	    keySignature: string;
	    waveform: number[];
	    artist: string;
	    genre: string;
	    mood: string;
	
	    static createFrom(source: any = {}) {
	        return new TrackMetadata(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filePath = source["filePath"];
	        this.title = source["title"];
	        this.durationSec = source["durationSec"];
	        this.bpm = source["bpm"];
	        this.keySignature = source["keySignature"];
	        this.waveform = source["waveform"];
	        this.artist = source["artist"];
	        this.genre = source["genre"];
	        this.mood = source["mood"];
	    }
	}

}

