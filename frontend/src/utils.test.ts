import { describe, it, expect } from 'vitest';
import { getFilename, formatTime, splitArtists } from './utils';

describe('utils', () => {
    describe('getFilename', () => {
        it('extracts filename from POSIX paths', () => {
            expect(getFilename('/home/user/music/song.mp3')).toBe('song.mp3');
        });

        it('extracts filename from Windows paths', () => {
            expect(getFilename('C:\\Music\\Album\\track.flac')).toBe('track.flac');
        });

        it('handles empty path', () => {
            expect(getFilename('')).toBe('');
        });
    });

    describe('formatTime', () => {
        it('formats zero seconds', () => {
            expect(formatTime(0)).toBe('0:00');
        });

        it('formats single-digit seconds with leading zero', () => {
            expect(formatTime(65)).toBe('1:05');
        });

        it('formats standard minute:second', () => {
            expect(formatTime(215)).toBe('3:35');
        });

        it('handles negative or NaN values safely', () => {
            expect(formatTime(NaN)).toBe('0:00');
            expect(formatTime(-10)).toBe('0:00');
        });
    });

    describe('splitArtists', () => {
        it('splits artists with commas and feat', () => {
            const res = splitArtists('Daft Punk, Pharrell Williams feat. Nile Rodgers');
            expect(res).toEqual(['Daft Punk', 'Pharrell Williams', 'Nile Rodgers']);
        });

        it('returns Unknown Artist for empty string', () => {
            expect(splitArtists('')).toEqual(['Unknown Artist']);
            expect(splitArtists(undefined)).toEqual(['Unknown Artist']);
        });
    });
});
