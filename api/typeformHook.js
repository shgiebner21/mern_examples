import winston from 'winston';
import { serializeError } from 'serialize-error';
import { ok, badRequest, notFound } from '../../http';
import { database } from 'palmetto-core/dist/db/mongo';
import crypto from 'crypto';
import { setAlchemyUserTrainingComplete } from '../../../helpers/user/setAlchemyUserTrainingComplete';
import { setUserTrainingStatus } from '../../../helpers/user/setUserTrainingStatus';
import { sendTrainingResultsEmail } from 'palmetto-core/dist/lib/sendGrid/sendTrainingResultsEmail';
import { typeformConfig } from '../../../config';
import { getLuxonFrom, getPostgresTimestampWithoutZone } from 'palmetto-core/dist/lib/util/clock';
import { types } from 'palmetto-core/src/constants';

export const verifyTypeformSignature = (signature, payload) => {
  const hash = crypto
    .createHmac('sha256', typeformConfig.webhookSecret)
    .update(payload)
    .digest('base64');

  const sig = `sha256=${hash}`;
  return signature === sig;
};

export const postTypeformTestResult = async (req, res) => {
  try {
    const { form_response = {} } = req.body;
    const { answers, calculated, hidden } = form_response;

    // validation that req is from TypeForm
    const expectedSig = req.header('Typeform-Signature');

    // Note that the req.originalBody buffer is added via bodyParser and a helper.
    // See app.js for where this happens.
    const isVerified = verifyTypeformSignature(expectedSig, req.originalBody);

    if (!isVerified) {
      return badRequest(res, [
        { code: 'signature-verification-error', message: 'request signature verfication failed' },
      ]);
    }

    // ALL typeform webhooks that pass security should be logged.
    let webhookReceived = {};
    webhookReceived.type = types.typeformTest;
    webhookReceived.event_id = req.body.event_id;
    webhookReceived.data = form_response;

    await database.webhookLogs.insertOne(webhookReceived, 'typeform');

    if (!hidden || !hidden.id) {
      return badRequest(res, [
        { code: 'missing-user-id', message: 'response from typeform did not contain alchemy user id' },
      ]);
    }

    if (!form_response.submitted_at) {
      return badRequest(res, [
        { code: 'missing-submitted-date', message: 'response from typeform did not contain submitted_at' },
      ]);
    }

    const submittedDate = getLuxonFrom(form_response.submitted_at);
    const questionCountObj = answers.filter(answer => answer.type === 'choice');
    const questionCount = questionCountObj.length;
    const testGrade = calculated.score / questionCount;
    const hasPassed = testGrade >= 0.8;
    const auth0UserId = hidden.id;

    // Find the user in mongo for updating their data in mongo and postgres
    const user = await database.users.findOne({ auth0UserId });

    if (!user) {
      return notFound(res, 'user record with id from typeform result was not found');
    }

    if (!user.training) {
      user.training = {};
    }

    user.training = {
      ...user.training,
      testGrade,
    };

    if (hasPassed) {
      const pgDate = getPostgresTimestampWithoutZone(submittedDate.setZone('America/New_York'));

      await setAlchemyUserTrainingComplete({ email: user.email, formSubmittedDate: pgDate });

      user.isTrainingComplete = true;
      user.training.trainingCompleted = submittedDate.toJSDate();
      user.training.examPassed = submittedDate.toJSDate();
    }

    await database.users.updateOne(user, 'Typeform');
    await setUserTrainingStatus({ userDoc: user, updatedBy: 'TypeForm' });

    await sendTrainingResultsEmail(
      {
        to: user.email,
        firstName: user.firstName,
        score: testGrade,
      },
      hasPassed,
    );

    ok(res);
  } catch (err) {
    winston.error('Error in Typeform webhook', { err: serializeError(err) });
    badRequest(res, err.message);
  }
};
