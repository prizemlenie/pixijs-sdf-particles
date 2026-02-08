export const debounce = <T>(func: (...args: T[]) => void, delay: number): ((...args: T[]) => void) => {
    let timeoutId: number | null = null;
    return (...args: T[]) => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            func(...args);
            timeoutId = null;
        }, delay);
    };
};
