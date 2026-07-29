export const jeeMainMockQuestions = Array.from({ length: 75 }).map((_, i) => {
  const qNum = i + 1;
  let subject = 'Physics';
  let section = 'A';
  let type = 'mcq';
  
  if (qNum > 25 && qNum <= 50) subject = 'Chemistry';
  if (qNum > 50) subject = 'Mathematics';

  // Determine if it is Section B (NAT)
  // Physics: 21-25, Chemistry: 46-50, Maths: 71-75
  if ((qNum >= 21 && qNum <= 25) || (qNum >= 46 && qNum <= 50) || (qNum >= 71 && qNum <= 75)) {
    section = 'B';
    type = 'nat';
  }

  if (qNum === 1) {
    return {
      id: `m-q${qNum}`, subject, section, type,
      question_text: "A particle is moving with a velocity v = K(yi + xj). The general equation for its path is:",
      options: ["y = x^2 + const", "y^2 = x^2 + const", "y = x + const", "xy = const"],
    };
  }
  if (qNum === 21) {
    return {
      id: `m-q${qNum}`, subject, section, type,
      question_text: "A block of mass 10 kg is placed on a rough horizontal surface with coefficient of friction 0.5. If a horizontal force of 100 N is applied, the acceleration (in m/s^2) is: (Take g = 10 m/s^2)",
    };
  }

  if (type === 'mcq') {
    return {
      id: `m-q${qNum}`, subject, section, type,
      question_text: `Sample ${subject} MCQ question ${qNum} (Section A).`,
      options: ["Option A", "Option B", "Option C", "Option D"],
    };
  } else {
    return {
      id: `m-q${qNum}`, subject, section, type,
      question_text: `Sample ${subject} Numerical question ${qNum} (Section B). Type your numeric answer.`,
    };
  }
});

export const jeeAdvMockQuestions = Array.from({ length: 51 }).map((_, i) => {
  const qNum = i + 1;
  let subject = 'Physics';
  if (qNum > 17 && qNum <= 34) subject = 'Chemistry';
  if (qNum > 34) subject = 'Mathematics';

  // JEE Advanced has mixed types. Let's make:
  // Q1-6: MCQ (Single Correct)
  // Q7-12: MSQ (Multiple Correct)
  // Q13-17: NAT (Numerical)
  let type = 'mcq';
  const mod = qNum % 17 === 0 ? 17 : qNum % 17;
  
  if (mod > 6 && mod <= 12) type = 'msq';
  if (mod > 12) type = 'nat';

  if (qNum === 1) {
    return {
      id: `a-q${qNum}`, subject, type,
      question_text: "Consider a spherical shell of radius R carrying uniform charge density. The electric field at R/2 is:",
      options: ["0", "E", "E/2", "2E"]
    };
  }
  if (qNum === 8) {
    return {
      id: `a-q${qNum}`, subject, type,
      question_text: "Which of the following statements are true for an ideal gas undergoing an adiabatic process?",
      options: ["PV^gamma = const", "TV^(gamma-1) = const", "T^gamma P^(1-gamma) = const", "Heat exchange is zero"]
    };
  }

  if (type === 'mcq') {
    return {
      id: `a-q${qNum}`, subject, type,
      question_text: `Advanced ${subject} MCQ (Single Correct) ${qNum}.`,
      options: ["Option A", "Option B", "Option C", "Option D"],
    };
  } else if (type === 'msq') {
    return {
      id: `a-q${qNum}`, subject, type,
      question_text: `Advanced ${subject} MSQ (Multiple Correct) ${qNum}. Select one or more.`,
      options: ["Statement P", "Statement Q", "Statement R", "Statement S"],
    };
  } else {
    return {
      id: `a-q${qNum}`, subject, type,
      question_text: `Advanced ${subject} Numerical ${qNum}.`,
    };
  }
});
