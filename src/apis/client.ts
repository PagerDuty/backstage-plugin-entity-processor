import fetch from 'node-fetch';
import type { RequestInit, Response } from 'node-fetch';
import type { EntityMapping } from '../types';
import { DiscoveryService, LoggerService } from '@backstage/backend-plugin-api';
import { PagerDutyEntityMappingResponse } from '@pagerduty/backstage-plugin-common';

export interface PagerDutyClientOptions {
    discovery: DiscoveryService;
    logger: LoggerService;
};

export type BackstageEntityRef = {
    type: string;
    namespace: string;
    name: string;
}

export class PagerDutyClient {
    private discovery: DiscoveryService;
    private logger: LoggerService;
    private baseUrl: string = "";
    
    constructor({ discovery, logger }: PagerDutyClientOptions) {
        this.discovery = discovery;
        this.logger = logger;
    }

    async findServiceMapping({ type, namespace, name }: BackstageEntityRef): Promise<EntityMapping> {
        let response: Response;

        if (this.baseUrl === "") {
            this.baseUrl = await this.discovery.getBaseUrl('pagerduty');
        }

        const options: RequestInit = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
                Accept: 'application/json, text/plain, */*',
            },
        };

        const url = `${await this.discovery.getBaseUrl(
            'pagerduty',
        )}/mapping/entity/${type}/${namespace}/${name}`;

        try {
            response = await fetch(url, options);

            const foundMapping: PagerDutyEntityMappingResponse = await response.json();                    

            switch (response.status) {
                case 400:                    
                    throw new Error(await response.text());
                case 404:
                    return {};
                default: // 200
                    this.logger.debug(`Found mapping for ${type}:${namespace}/${name}: ${JSON.stringify(foundMapping.mapping)}`);

                    return {
                        serviceId: foundMapping.mapping.serviceId,
                        integrationKey: foundMapping.mapping.integrationKey,
                        entityRef: foundMapping.mapping.entityRef,
                        account: foundMapping.mapping.account,
                    }
            }
        } catch (error) {
            this.logger.error(`Failed to retrieve mapping for ${type}:${namespace}/${name}: ${error}`);
            throw new Error(`Failed to retrieve mapping for ${type}:${namespace}/${name}: ${error}`);
        }
    }

}