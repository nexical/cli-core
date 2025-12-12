import { consola, LogLevels } from 'consola';

export const logger = consola.create({
    defaults: {
        tag: 'CLI',
    },
    level: LogLevels.info
});

export function setDebugMode(enabled: boolean) {
    logger.level = enabled ? LogLevels.debug : LogLevels.info;
}
