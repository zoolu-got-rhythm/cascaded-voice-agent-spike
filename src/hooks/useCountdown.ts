import { useEffect, useRef, useState } from "react";
import { StopWatch } from "@slime/stopwatch";

export function useCountdown(durationSecs: number, onTimeOver: () => void): number {
    const [remaining, setRemaining] = useState(durationSecs);
    const stopwatchRef = useRef(new StopWatch());
    const firedRef = useRef(false);

    useEffect(() => {
        const sw = stopwatchRef.current;
        sw.reset();
        sw.startTimer();
        firedRef.current = false;
        setRemaining(durationSecs);

        const interval = setInterval(() => {
            const elapsedSecs = Math.floor(sw.getTimeElapsedInMs / 1000);
            const rem = Math.max(0, durationSecs - elapsedSecs);
            setRemaining(rem);

            if (rem <= 0 && !firedRef.current) {
                firedRef.current = true;
                clearInterval(interval);
                sw.stopTimer();
                onTimeOver();
            }
        }, 1000);

        return () => {
            clearInterval(interval);
            sw.stopTimer();
        };
    }, [durationSecs]); // eslint-disable-line react-hooks/exhaustive-deps

    return remaining;
}
