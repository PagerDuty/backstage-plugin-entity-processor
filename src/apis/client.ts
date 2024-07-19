import fetch from 'node-fetch';
import type {
    RequestInit,
    Response
} from 'node-fetch';
import type { EntityMapping } from '../types';
import {
    DiscoveryService,
    LoggerService
} from '@backstage/backend-plugin-api';
import {
    PagerDutyEntityMapping,
    PagerDutyEntityMappingResponse,
    PagerDutyServiceResponse,
import { DiscoveryService, LoggerService } from '@backstage/backend-plugin-api';
import { PagerDutyEntityMappingResponse } from '@pagerduty/backstage-plugin-common';
} from '@pagerduty/backstage-plugin-common';

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

    async findServiceMapping({ type, namespace, name }: BackstageEntityRef): Promise<EntityMapping | undefined> {
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
                    return undefined;
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

    async findServiceMappingById(serviceId: string): Promise<EntityMapping | undefined> {
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
        )}/mapping/entity/service/${serviceId}`;

        try {
            response = await fetch(url, options);

            const foundMapping: PagerDutyEntityMappingResponse = await response.json();

            switch (response.status) {
                case 400:
                    throw new Error(await response.text());
                case 404:
                    return undefined;
                default: // 200
                    this.logger.debug(`Found mapping for serviceId ${serviceId}: ${JSON.stringify(foundMapping.mapping)}`);

                    return {
                        serviceId: foundMapping.mapping.serviceId,
                        integrationKey: foundMapping.mapping.integrationKey,
                        entityRef: foundMapping.mapping.entityRef,
                        account: foundMapping.mapping.account,
                    };
            }
        } catch (error) {
            this.logger.error(`Failed to retrieve mapping for serviceId ${serviceId}: ${error}`);
            throw new Error(`Failed to retrieve mapping for serviceId ${serviceId}: ${error}`);
        }
    }

    async insertServiceMapping(mapping: PagerDutyEntityMapping): Promise<void> {
        let response: Response;

        if (this.baseUrl === "") {
            this.baseUrl = await this.discovery.getBaseUrl('pagerduty');
        }

        const options: RequestInit = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
                Accept: 'application/json, text/plain, */*',
            },
            body: JSON.stringify(mapping),
        };

        const url = `${await this.discovery.getBaseUrl(
            'pagerduty',
        )}/mapping/entity`;

        try {
            response = await fetch(url, options);

            if (!response.ok) {
                throw new Error(await response.text());
            }
        } catch (error) {
            this.logger.error(`Failed to add mapping for ${mapping.entityRef}: ${error}`);
            throw new Error(`Failed to add mapping for ${mapping.entityRef}: ${error}`);
        }
    }


    async getServiceIdFromIntegrationKey(integrationKey: string, account?: string): Promise<string> {
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

        let url = `${await this.discovery.getBaseUrl(
            'pagerduty',
        )}/services?integration_key=${integrationKey}`;

        if (account) {
            url = url.concat(`&account=${account}`);
        }

        try {
            response = await fetch(url, options);

            const foundService: PagerDutyServiceResponse = await response.json();

            switch (response.status) {
                case 400:
                    throw new Error(await response.text());
                case 404:
                    return "";
                default: // 200
                    return foundService.service.id;
            }
        } catch (error) {
            this.logger.error(`Failed to retrieve a PagerDuty service id for integration key ${integrationKey}: ${error}`);
            throw new Error(`Failed to retrieve a PagerDuty service id for integration key ${integrationKey}: ${error}`);
        }
    }

    async getIntegrationKeyFromServiceId(serviceId: string, account?: string): Promise<string | undefined> {
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

        let url = `${await this.discovery.getBaseUrl(
            'pagerduty',
        )}/services/${serviceId}`;

        if (account) {
            url = url.concat(`?account=${account}`);
        }

        try {
            response = await fetch(url, options);

            const foundService: PagerDutyServiceResponse = await response.json();
            const backstageIntegration = foundService.service.integrations?.find(integration => integration.vendor?.id === "PRO19CT");

            switch (response.status) {
                case 400:
                    throw new Error(await response.text());
                case 404:
                    return "";
                default: // 200

                    if (!backstageIntegration) {
                        return undefined;
                    }

                    return backstageIntegration.integration_key;
            }
        } catch (error) {
            this.logger.error(`No Backstage integration found for service id ${serviceId}: ${error}`);
            throw new Error(`No Backstage integration found for service id ${serviceId}: ${error}`);
        }
    }

}