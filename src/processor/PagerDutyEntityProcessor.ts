import { DiscoveryService, LoggerService } from "@backstage/backend-plugin-api";
import { Entity } from "@backstage/catalog-model";
import { CatalogProcessor } from "@backstage/plugin-catalog-node";
import { PagerDutyClient } from "../apis/client";

/**
 * A function which given an entity, determines if it should be processed for linguist tags.
 * @public
 */
export type ShouldProcessEntity = (entity: Entity) => boolean;

export interface PagerDutyEntityProcessorOptions {
    logger: LoggerService;
    discovery: DiscoveryService;
};

export class PagerDutyEntityProcessor implements CatalogProcessor {
    private logger: LoggerService;
    private discovery: DiscoveryService;

    private shouldProcessEntity: ShouldProcessEntity = (entity: Entity) => {
        return entity.kind === 'Component';
    }

    constructor({ logger, discovery }: PagerDutyEntityProcessorOptions) {
        this.logger = logger;
        this.discovery = discovery;
    }

    getProcessorName(): string {
        return "PagerDutyEntityProcessor";
    }

    async postProcessEntity(entity: Entity): Promise<Entity> {
        if (this.shouldProcessEntity(entity)) {
            try {

                const client = new PagerDutyClient({ discovery: this.discovery, logger: this.logger });
                const mapping = await client.findServiceMapping({
                    type: entity.kind.toLowerCase(),
                    namespace: entity.metadata.namespace!.toLowerCase(),
                    name: entity.metadata.name.toLowerCase(),
                });

                if (mapping.serviceId) { // not an empty object                
                    if (mapping.serviceId && mapping.serviceId !== "") {
                        entity.metadata.annotations!["pagerduty.com/service-id"] = mapping.serviceId;
                    }
                    else {
                        delete entity.metadata.annotations!["pagerduty.com/service-id"];
                    }

                    if (mapping.integrationKey && mapping.integrationKey !== "") {
                        entity.metadata.annotations!["pagerduty.com/integration-key"] = mapping.integrationKey;
                    }
                    else {
                        delete entity.metadata.annotations!["pagerduty.com/integration-key"];
                    }

                    this.logger.debug(`Added annotations to entity ${entity.metadata.name} with service id: ${mapping.serviceId} and integration key: ${mapping.integrationKey}`);
                } else {
                    this.logger.debug(`No mapping found for entity: ${entity.metadata.name}`);
                }
            } catch (error) {
                this.logger.error(`Error processing entity: ${entity.metadata.name}`);
                this.logger.error(`${error}`);
            }
        }

        return entity;
    }
}