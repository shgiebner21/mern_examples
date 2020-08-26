import { postTypeformTestResult, verifyTypeformSignature } from './typeformHook';
import crypto from 'crypto';
import { DateTime } from 'luxon';
import { database } from 'palmetto-core/dist/db/mongo';
import { setAlchemyUserTrainingComplete } from '../../../helpers/user/setAlchemyUserTrainingComplete';
import { setUserTrainingStatus } from '../../../helpers/user/setUserTrainingStatus';
import { sendTrainingResultsEmail } from 'palmetto-core/dist/lib/sendGrid/sendTrainingResultsEmail';
import { typeformConfig } from '../../../config';
import { badRequest, ok, notFound } from '../../http';
import { getLuxonFrom, getPostgresTimestampWithoutZone } from 'palmetto-core/dist/lib/util/clock';

jest.mock('palmetto-core/dist/db/mongo');
jest.mock('palmetto-core/dist/db/alchemy/user/updateUserTrainingCompleted');
jest.mock('palmetto-core/dist/lib/sendGrid/sendTrainingResultsEmail');
jest.mock('../../../config');
jest.mock('../../http');
jest.mock('palmetto-core/dist/lib/util/clock');
jest.mock('../../../helpers/user/setAlchemyUserTrainingComplete');
jest.mock('../../../helpers/user/setUserTrainingStatus');

const secret = 'secret';
const res = 'imma response';
let req, body, hash, signature, webhookReceived;
beforeEach(() => {
  body = {
    event_id: 'imma Id',
    form_response: {
      answers: [
        {
          type: 'email',
          email: 'esteban@email.com',
          field: {
            id: 'T6SAKyckikWV',
            type: 'email',
            ref: '75417bf4-3800-48df-8f9f-dd47ed74ba4f',
          },
        },
        {
          type: 'choice',
          choice: {
            label: 'London',
          },
          field: {
            id: 'k6TP9oLGgHjl',
            type: 'multiple_choice',
          },
        },
      ],
      calculated: {
        score: 1,
      },
      hidden: {
        id: 'auth0',
      },
      submitted_at: '2020-06-19T13:44:00.000Z',
    },
  };
  req = {
    header: () => signature,
    body,
    originalBody: JSON.stringify(body),
  };
  hash = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(body))
    .digest('base64');
  signature = `sha256=${hash}`;
  database.users.findOne.mockResolvedValue({
    id: '123456',
    email: 'esteban61@mailinator.com',
    firstName: 'Esteban',
  });
  typeformConfig.webhookSecret = secret;
  getLuxonFrom.mockReturnValue(DateTime.fromISO('2020-06-19T13:44:00.000Z', { zone: 'UTC' }));
  getPostgresTimestampWithoutZone.mockReturnValue('2020-06-19 09:44:00');
});

it('can tell if the signatures match', async () => {
  expect(verifyTypeformSignature(signature, req.originalBody)).toEqual(true);
});

it('posts data to the webhookRecieved collection', async () => {
  database.webhookLogs.insertOne.mockResolvedValueOnce(webhookReceived);

  await postTypeformTestResult(req, res);

  expect(database.webhookLogs.insertOne.mock.calls[0]).toMatchInlineSnapshot(`
    Array [
      Object {
        "data": Object {
          "answers": Array [
            Object {
              "email": "esteban@email.com",
              "field": Object {
                "id": "T6SAKyckikWV",
                "ref": "75417bf4-3800-48df-8f9f-dd47ed74ba4f",
                "type": "email",
              },
              "type": "email",
            },
            Object {
              "choice": Object {
                "label": "London",
              },
              "field": Object {
                "id": "k6TP9oLGgHjl",
                "type": "multiple_choice",
              },
              "type": "choice",
            },
          ],
          "calculated": Object {
            "score": 1,
          },
          "hidden": Object {
            "id": "auth0",
          },
          "submitted_at": "2020-06-19T13:44:00.000Z",
        },
        "event_id": "imma Id",
        "type": "typeform.testResults",
      },
      "typeform",
    ]
  `);
  expect(ok.mock.calls[0]).toMatchInlineSnapshot(`
    Array [
      "imma response",
    ]
  `);
});

it('returns badRequest if alchemy user id is not in typeform result', async () => {
  delete req.body.form_response.hidden;

  await postTypeformTestResult(req, res);

  expect(badRequest.mock.calls[0]).toMatchInlineSnapshot(`
    Array [
      "imma response",
      Array [
        Object {
          "code": "missing-user-id",
          "message": "response from typeform did not contain alchemy user id",
        },
      ],
    ]
  `);
});

it('returns badRequest if form_response has no submitted_at value', async () => {
  delete req.body.form_response.submitted_at;

  await postTypeformTestResult(req, res);

  expect(badRequest.mock.calls[0]).toMatchInlineSnapshot(`
    Array [
      "imma response",
      Array [
        Object {
          "code": "missing-submitted-date",
          "message": "response from typeform did not contain submitted_at",
        },
      ],
    ]
  `);
});

it('returns an error if a user is not found by email', async () => {
  database.users.findOne.mockResolvedValueOnce(undefined);
  await postTypeformTestResult(req, res);

  expect(notFound.mock.calls[0]).toMatchInlineSnapshot(`
    Array [
      "imma response",
      "user record with id from typeform result was not found",
    ]
  `);
});

it('returns an error if the request signing signature fails verification', async () => {
  await postTypeformTestResult({ ...req, header: () => 'notthecorrectsignature' }, res);

  expect(setAlchemyUserTrainingComplete).toBeCalledTimes(0);
  expect(setUserTrainingStatus).toBeCalledTimes(0);
  expect(badRequest.mock.calls[0]).toMatchInlineSnapshot(`
    Array [
      "imma response",
      Array [
        Object {
          "code": "signature-verification-error",
          "message": "request signature verfication failed",
        },
      ],
    ]
  `);
});

it('causes an email to be sent', async () => {
  await postTypeformTestResult(req, res);

  expect(sendTrainingResultsEmail.mock.calls[0]).toMatchInlineSnapshot(`
    Array [
      Object {
        "firstName": "Esteban",
        "score": 1,
        "to": "esteban61@mailinator.com",
      },
      true,
    ]
  `);
});

it('returns an ok if a user is updated', async () => {
  await postTypeformTestResult(req, res);

  expect(setAlchemyUserTrainingComplete).toBeCalledTimes(1);
  expect(setAlchemyUserTrainingComplete.mock.calls[0]).toMatchInlineSnapshot(`
    Array [
      Object {
        "email": "esteban61@mailinator.com",
        "formSubmittedDate": "2020-06-19 09:44:00",
      },
    ]
  `);
  expect(setUserTrainingStatus).toBeCalledTimes(1);
  expect(setUserTrainingStatus.mock.calls[0]).toMatchInlineSnapshot(`
    Array [
      Object {
        "updatedBy": "TypeForm",
        "userDoc": Object {
          "email": "esteban61@mailinator.com",
          "firstName": "Esteban",
          "id": "123456",
          "isTrainingComplete": true,
          "training": Object {
            "examPassed": 2020-06-19T13:44:00.000Z,
            "testGrade": 1,
            "trainingCompleted": 2020-06-19T13:44:00.000Z,
          },
        },
      },
    ]
  `);
  expect(ok).toBeCalledTimes(1);
});
