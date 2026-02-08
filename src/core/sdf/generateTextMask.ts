import { Texture } from 'pixi.js';

export interface TextMaskOptions {
    /** Text to render */
    text: string;
    /** Texture resolution (width and height) */
    resolution: { width: number; height: number };
    /** Total width of the text string in pixels */
    textWidth: number;
    /** Percentage of total width that spaces between letters should occupy (0-1) */
    spacingPercent: number;
    /** Font family (defaults to 'LatoThin') */
    fontFamily?: string;
    /** Text color (defaults to 'white') */
    fillColor?: string;
}

export interface TextMaskResult {
    /** Array of textures - one for each letter */
    textures: Texture[];
    /** Font size in pixels used to render the text */
    fontSize: number;
    /** Letter spacing in pixels */
    letterSpacing: number;
}

/**
 * Generates an array of textures - one for each letter.
 * Each letter is positioned on its own texture in the same position
 * as if it were part of the whole word.
 * Letter sizes are calculated based on textWidth and spacingPercent,
 * preserving font proportions.
 * Textures are compatible with pixi.js.
 */
export async function generateTextMask(options: TextMaskOptions): Promise<TextMaskResult> {
    try {
        const customFont = new FontFace('LatoThin', 'url(/Lato-Thin.ttf)');
        await customFont.load();
        document.fonts.add(customFont);
    } catch (error) {
        console.warn('Could not load custom font, falling back to default. Error:', error);
    }
    const { text, resolution, textWidth, spacingPercent, fontFamily = 'LatoThin', fillColor = 'white' } = options;

    const chars = text.split('');
    const textures: Texture[] = [];

    if (chars.length === 0) {
        return { textures, fontSize: 0, letterSpacing: 0 };
    }

    // Create temporary canvas for measuring character widths at reference size
    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    if (!measureCtx) {
        throw new Error('Could not get 2d context from canvas');
    }

    // Use a reference font size to measure proportions
    const referenceFontSize = 100;
    measureCtx.font = `${referenceFontSize}px ${fontFamily}`;

    // Measure width of each character at reference size
    const refCharWidths: number[] = [];
    let totalRefWidth = 0;

    for (const char of chars) {
        const metrics = measureCtx.measureText(char);
        refCharWidths.push(metrics.width);
        totalRefWidth += metrics.width;
    }

    // Remove temporary canvas for measurements
    measureCanvas.remove();

    // Calculate total spacing width and letters width
    const totalSpacingWidth = textWidth * spacingPercent;
    const totalLettersWidth = textWidth * (1 - spacingPercent);

    // Calculate letter spacing (space between each pair of letters)
    const numSpaces = chars.length > 1 ? chars.length - 1 : 0;
    const letterSpacing = numSpaces > 0 ? totalSpacingWidth / numSpaces : 0;

    // Calculate scale factor to fit all letters into totalLettersWidth
    const scaleFactor = totalLettersWidth / totalRefWidth;

    // Calculate actual font size and character widths
    const charHeight = referenceFontSize * scaleFactor;
    const charWidths = refCharWidths.map((w) => w * scaleFactor);

    // Calculate actual total width for centering
    const actualTotalWidth = totalLettersWidth + totalSpacingWidth;

    // Calculate starting position for centering
    const startX = (resolution.width - actualTotalWidth) / 2;
    const centerY = resolution.height / 2;

    // Calculate positions of all characters
    const charPositions: number[] = [];
    let currentX = startX;
    for (let i = 0; i < chars.length; i++) {
        charPositions.push(currentX);
        currentX += charWidths[i] + letterSpacing;
    }

    // Create texture for each letter
    for (let i = 0; i < chars.length; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = resolution.width;
        canvas.height = resolution.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Could not get 2d context from canvas');
        }

        // Fill canvas with black background
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Set up font and draw the letter
        ctx.font = `${charHeight}px ${fontFamily}`;
        ctx.fillStyle = fillColor;
        ctx.textBaseline = 'middle';
        ctx.fillText(chars[i], charPositions[i], centerY);

        // Create pixi.js texture from canvas
        const texture = Texture.from(canvas);
        textures.push(texture);
    }

    return { textures, fontSize: charHeight, letterSpacing };
}
