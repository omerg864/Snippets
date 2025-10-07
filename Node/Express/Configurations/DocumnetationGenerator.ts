// server/config/doc.config.ts
import { z, ZodTypeAny } from 'zod';
import { createSchema, createDocument, SchemaResult } from 'zod-openapi';
import fs from 'fs';
import path from 'path';
import {
	ErrorName,
	errorStatusMap,
} from '../../shared/constants/error.constants';
import { errorSchema } from '../../shared/schemas/base.schema';
import { OpenAPIObject } from 'zod-openapi/dist/openapi3-ts/dist/oas31';
import { baseSchemas } from '../../shared/constants/base.schemas.constants';
import { NODE_ENV } from './env';

export type MethodType = 'get' | 'post' | 'put' | 'patch' | 'delete';
export type AuthenticatedUser = 'none' | 'user' | 'admin';
export type ParamType = 'path' | 'query' | 'cookie';
export type ContentType = 'application/json' | 'multipart/form-data';
export type FileField = {
	name: string;
	required?: boolean;
	description?: string;
	type?: 'binary' | 'array';
};

type ParamsOpenApiSchema = {
	name: string;
	in: ParamType;
	required: boolean;
	schema: SchemaResult;
};

export interface AddDocRouteParams {
	name: string; // name of the route, used for schema names
	route: string;
	method: MethodType;
	summary: string;
	requestSchemas?: {
		params?: ZodTypeAny;
		query?: ZodTypeAny;
		body?: ZodTypeAny;
		contentType?: ContentType;
		cookies?: ZodTypeAny;
		optionalParams?: string[]; // list of required cookies for the route
		fileFields?: FileField[];
	};
	responses: Record<
		number,
		{
			description: string;
			schema?: ZodTypeAny;
			cookies?: string;
			contentType?: ContentType;
		}
	>;
	errors?: ErrorName[];
	authenticatedUser: AuthenticatedUser;
	tags?: string[]; // tags for the route, used for grouping in OpenAPI
}

const schemas: Record<string, any> = {};
const paths: Record<string, any> = {};

const expressRouteToOpenApiRoute = (p: string) =>
	p.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

function addZodSchema(
	name: string,
	schema: ZodTypeAny,
	fileFields: FileField[] = []
): boolean {
	const openApiSchema = createSchema(schema);
	if (openApiSchema.components) {
		const objectSchema = Object.values(openApiSchema.components)[0] as any;
		for (const fileField of fileFields) {
			if (fileField.type === 'array') {
				objectSchema.properties[fileField.name] = {
					type: 'array',
					required: fileField.required,
					description: fileField.description,
					items: {
						type: 'string',
						format: 'binary',
					},
				};
			} else {
				objectSchema.properties[fileField.name] = {
					type: 'binary',
					required: fileField.required,
					description: fileField.description,
				};
			}
		}
		schemas[name] = objectSchema;
		return true;
	}
	return false;
}

function generateParamDocFromSchema(
	name: string,
	schema: ZodTypeAny | undefined,
	loc: ParamType,
	optionalParams: string[] = []
): ParamsOpenApiSchema[] {
	const params = [];
	if (!name || !schema) return [];
	const addedSchema = addZodSchema(`${name}`, schema);
	if (!addedSchema) return [];
	if (schema instanceof z.ZodObject) {
		for (const [k, v] of Object.entries(schema.shape)) {
			params.push({
				name: k,
				in: loc,
				required: optionalParams.includes(k) ? false : true,
				schema: createSchema(v as ZodTypeAny),
			});
		}
	}
	return params;
}

export function addDocRoute(params: AddDocRouteParams) {
	const {
		authenticatedUser,
		route,
		method,
		responses,
		name,
		requestSchemas,
		summary,
		tags,
	} = params;
	let { errors = [] } = params;
	const openApiPath = expressRouteToOpenApiRoute(route);
	const op: any = { summary, parameters: [], responses: {}, tags };

	if (authenticatedUser !== 'none') {
		if (!errors.includes(ErrorName.UNAUTHORIZED)) {
			errors.push(ErrorName.UNAUTHORIZED);
		}
		op.security = [{ bearerAuth: [] }];
	}

	const pathParams = generateParamDocFromSchema(
		`${name}:params`,
		requestSchemas?.params,
		'path',
		requestSchemas?.optionalParams ?? []
	);
	if (pathParams.length > 0) {
		if (!errors.includes(ErrorName.VALIDATION_ERROR)) {
			errors.push(ErrorName.VALIDATION_ERROR);
		}
		op.parameters.push(...pathParams);
	}

	const queryParams = generateParamDocFromSchema(
		`${name}:query`,
		requestSchemas?.query,
		'query',
		requestSchemas?.optionalParams ?? []
	);

	if (queryParams.length > 0) {
		if (!errors.includes(ErrorName.VALIDATION_ERROR)) {
			errors.push(ErrorName.VALIDATION_ERROR);
		}
		op.parameters.push(...queryParams);
	}

	const cookieParams = generateParamDocFromSchema(
		`${name}:cookies`,
		requestSchemas?.cookies,
		'cookie',
		requestSchemas?.optionalParams ?? []
	);

	if (cookieParams.length > 0) {
		if (!errors.includes(ErrorName.VALIDATION_ERROR)) {
			errors.push(ErrorName.VALIDATION_ERROR);
		}
		op.parameters.push(...cookieParams);
	}

	if (requestSchemas?.body) {
		const addedSchema = addZodSchema(
			`${name}:body`,
			requestSchemas?.body,
			requestSchemas.fileFields
		);
		if (addedSchema) {
			if (!errors.includes(ErrorName.VALIDATION_ERROR)) {
				errors.push(ErrorName.VALIDATION_ERROR);
			}
			op.requestBody = {
				required: true,
				content: {
					[requestSchemas.contentType ?? 'application/json']: {
						schema: { $ref: `#/components/schemas/${name}:body` },
					},
				},
			};
		}
	}

	for (const [
		statusCode,
		{ description, schema, cookies, contentType = 'application/json' },
	] of Object.entries(responses)) {
		if (schema) {
			const addedSchema = addZodSchema(
				`${name}:response${statusCode}`,
				schema
			);
			if (addedSchema) {
				const cookiesOpenApi = cookies
					? {
							headers: {
								'Set-Cookie': {
									description: cookies,
									schema: {
										type: 'string',
									},
								},
							},
					  }
					: undefined;
				op.responses[statusCode] = {
					description,
					...cookiesOpenApi,
					content: {
						[contentType]: {
							schema: {
								$ref: `#/components/schemas/${name}:response${statusCode}`,
							},
						},
					},
				};
			}
		} else {
			op.responses[statusCode] = { description };
		}
	}

	for (const err of errors) {
		const status = errorStatusMap[err] ?? 500;
		op.responses[status] = {
			description: err,
			content: {
				'application/json': {
					schema: { $ref: `#/components/schemas/${err}` },
				},
			},
		};
	}

	paths[openApiPath] ??= {};
	paths[openApiPath][method] = op;
}

function addErrorComponents() {
	const errorNames = Object.values(ErrorName);
	errorNames.forEach((name) => {
		const status = errorStatusMap[name] ?? 500;
		const customErrorSchema = errorSchema
			.extend({
				name: z.string().meta({
					description: 'Error class name.',
					example: name,
				}),
			})
			.meta({
				ref: name,
				description: `${name} response`,
			});
		addZodSchema(name, customErrorSchema);
	});
}

export function buildOpenApiDoc(): OpenAPIObject {
	// register base schemas
	for (const baseSchema of baseSchemas) {
		addZodSchema(baseSchema.name, baseSchema.schema);
	}
	addErrorComponents();
	const openApiObject = createDocument({
		openapi: '3.0.0',
		info: { title: 'My API', version: '1.0.0' },
		paths,
		components: {
			schemas,
			securitySchemes: {
				bearerAuth: {
					type: 'http',
					scheme: 'bearer',
					bearerFormat: 'JWT',
				},
			},
		},
	});
	if (NODE_ENV === 'development') {
		createOpenApiFile(openApiObject);
	}
	return openApiObject;
}

export function createOpenApiFile(openApiObject: OpenAPIObject) {
	const outputPath = path.resolve(__dirname, '../../openapi.json');
	fs.writeFileSync(
		outputPath,
		JSON.stringify(openApiObject, null, 2),
		'utf-8'
	);

	console.log(`✅ OpenAPI file saved to: ${outputPath}`);
}
