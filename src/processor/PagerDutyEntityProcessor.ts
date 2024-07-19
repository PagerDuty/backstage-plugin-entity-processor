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

let client : PagerDutyClient;

export class PagerDutyEntityProcessor implements CatalogProcessor {
    private logger: LoggerService;
    private discovery: DiscoveryService;

    private shouldProcessEntity: ShouldProcessEntity = (entity: Entity) => {
        return entity.kind === 'Component';
    }

    constructor({ logger, discovery }: PagerDutyEntityProcessorOptions) {
        this.logger = logger;
        this.discovery = discovery;

        client = new PagerDutyClient({ discovery: this.discovery, logger: this.logger });
    }

    getProcessorName(): string {
        return "PagerDutyEntityProcessor";
    }

    async postProcessEntity(entity: Entity): Promise<Entity> {
        if (this.shouldProcessEntity(entity)) {
            try {
                // Process service mapping overrides
                // Find the service mapping for the entity in database
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

                    if (mapping.account && mapping.account !== "") {
                        entity.metadata.annotations!["pagerduty.com/account"] = mapping.account;
                    }
                    else {
                        delete entity.metadata.annotations!["pagerduty.com/account"];
                    }
                // If mapping exists add the annotations to the entity
                if (mapping) {        
                    updateAnnotations(entity,
                        {
                            serviceId: mapping.serviceId,
                            integrationKey: mapping.integrationKey,
                            account: mapping.account
                        }
                    );

                    this.logger.debug(`Added annotations to entity ${entity.metadata.name} with service id: ${mapping.serviceId}, integration key: ${mapping.integrationKey} and account: ${mapping.account}`);
                } else {
                    this.logger.debug(`No mapping found for entity: ${entity.metadata.name}`);
                }

                    // Add the mapping to the database based on entity annotations
                    let serviceId = entity.metadata.annotations?.["pagerduty.com/service-id"];
                    let integrationKey = entity.metadata.annotations?.["pagerduty.com/integration-key"];
                    const account = entity.metadata.annotations?.["pagerduty.com/account"];

                    // Build the entityRef string
                    const entityRef = `${entity.kind.toLowerCase()}:${entity.metadata.namespace?.toLowerCase()}/${entity.metadata.name.toLowerCase()}`;

                    if (serviceId) {                    
                        // Check for mapping override by user
                        const serviceMappingOverrideFound = await client.findServiceMappingById(serviceId);

                        // If service mapping override is not found
                        // insert the mapping into the database
                        if (!serviceMappingOverrideFound) {
                            // if integrationKey annotation does not exist
                            // try to retrieve it from PagerDuty
                            if (!integrationKey) {
                                const foundIntegrationKey = await client.getIntegrationKeyFromServiceId(serviceId, account);

                                if (foundIntegrationKey) {
                                    integrationKey = foundIntegrationKey;
                                }
                            }

                            // Insert the mapping into the database
                            await client.insertServiceMapping({
                                entityRef,
                                serviceId,
                                integrationKey,
                                account,
                            });

                            // Add the annotations to the entity
                            updateAnnotations(entity,
                                {
                                    serviceId,
                                    integrationKey,
                                    account
                                }
                            );
                        }
                        else {
                            updateAnnotations(entity, {}); // delete annotations because user unmapped the service
                        }
                    } 
                    else if (integrationKey) {
                        serviceId = await client.getServiceIdFromIntegrationKey(integrationKey, account);

                        // Check for mapping override by user
                        const serviceMappingOverrideFound = await client.findServiceMappingById(serviceId);

                        // If service mapping override is not found
                        // insert the mapping into the database
                        if (!serviceMappingOverrideFound) {
                            // Insert the mapping into the database
                            await client.insertServiceMapping({
                                entityRef,
                                serviceId,
                                integrationKey,
                                account,
                            });

                            updateAnnotations(entity,
                                {
                                    serviceId,
                                    integrationKey,
                                    account
                                }
                            );
                        }
                        else {
                            updateAnnotations(entity, {}); // delete annotations because user unmapped the service
                        }
                    }
                }
            } catch (error) {
                this.logger.error(`Error processing entity ${entity.metadata.name}: ${error}`);
            }
        }

        return entity;
    }
}

export type AnnotationUpdateProps = {
    serviceId?: string;
    integrationKey?: string;
    account?: string;
};

function updateAnnotations(entity: Entity, annotations: AnnotationUpdateProps): void {
    // If serviceId is present, add the annotations to the entity
    if (annotations.serviceId && annotations.serviceId !== "") {
        entity.metadata.annotations!["pagerduty.com/service-id"] = annotations.serviceId;
    }
    else {
        delete entity.metadata.annotations!["pagerduty.com/service-id"];
    }

    // If integrationKey is present, add the annotations to the entity
    if (annotations.integrationKey && annotations.integrationKey !== "") {
        entity.metadata.annotations!["pagerduty.com/integration-key"] = annotations.integrationKey;
    }
    else {
        delete entity.metadata.annotations!["pagerduty.com/integration-key"];
    }

    // If account is present, add the annotations to the entity
    if (annotations.account && annotations.account !== "") {
        entity.metadata.annotations!["pagerduty.com/account"] = annotations.account;
    }
    else {
        delete entity.metadata.annotations!["pagerduty.com/account"];
    }
}